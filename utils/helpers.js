import { flatten, uniqBy, includes } from 'lodash';
import { map, mapSeries, filter, parallel } from 'async';
import { default as baseRequest } from 'request';
import { default as parse } from 'csv-parse/lib/sync';
require('dotenv').config();
const request = baseRequest.defaults({timeout: 60000});
const stationsLink = 'http://battuta.s3.amazonaws.com/eea-stations-all.json';
const metadataLink = 'http://discomap.eea.europa.eu/map/fme/metadata/PanEuropean_metadata.csv';
const apiKey = process.env.PELIAS_KEY;

export function addStations (cb) {
  console.log('---adding stations---');
  // get metadata records and station ids from current eea-country-locations file
  parallel([
    (done) => {
      request.get({
        url: metadataLink
      }, (err, res, body) => {
        if (err || res.statusCode !== 200) {
          return done(null, []);
        }
        // grab rows for select country
        done(null, parse(body, {delimiter: '\t'}).slice(1, -1));
      });
    },
    (done) => {
      request.get({ url: stationsLink }, (err, res, body) => {
        if (err || res.statusCode !== 200) {
          done(null, []);
        }
        const stationFileData = JSON.parse(body);
        map(stationFileData, (station, cb) => {
          return cb(null, Number(station.latitude).toFixed(6));
        }, (err, stationLatitudes) => {
          if (err) {
            return done(null, []);
          }
          done(null, [stationFileData, stationLatitudes]);
        });
      });
    }
  ], (err, stationData) => {
    if (err) {
      cb('err', []);
    }
    // filter metadata to only records that don't exist in our current records.
    filter(stationData[0], (record, done) => {
      // match the 6 decimal percision in the initialized stations made in init-eea-stations
      done(null, !(includes(stationData[1][1], Number(record[15]).toFixed(6))));
    }, (err, newStations) => {
      // do nothing if there is nothing new
      if (err || newStations.length === 0) {
        cb('err', []);
      }
      // make new station json
      getStations(newStations, (err, stations) => {
        if (err) {
          return cb('err', []);
        }
        // add city bounds, city names, and regions
        reverseGeocodeStations(stations, (err, stations) => {
          if (err) {
            return cb('err', []);
          }
          // callback a combo of old and new stations
          cb(null, stations.concat.apply(stationData[1][0]));
        });
      });
    });
  });
}

export function initStations (cb) {
  console.log('---initializing stations---');
  // get metadata records and station ids from current eea-country-locations file
  request.get({
    url: metadataLink
  }, (err, res, body) => {
    if (err || res.statusCode !== 200) {
      return cb(null, []);
    }
    let data;
    try {
      data = parse(body, {delimiter: '\t'});
    } catch (e) {
      return cb('could not initialize stations', []);
    }
    // make new station json
    getStations(data.slice(1, -1), (err, stations) => {
      if (err) {
        return cb('err', []);
      }
      // add city bounds, city names, and regions
      reverseGeocodeStations(stations, (err, cityStations) => {
        if (err) {
          return cb('err', []);
        }
        // callback a combo of old and new stations
        cb(null, cityStations);
      });
    });
  });
}

function getStations (countryMetadata, cb) {
  // transform station rows into objects
  map(countryMetadata, (record, done) => {
    // set percision to 6 decimal places to handle inconsistent rounding found in metadata file
    const station = {
      stationId: record[5],
      latitude: Number(record[15]).toFixed(6),
      longitude: Number(record[14]).toFixed(6)
    };
    done(null, station);
  }, (err, mappedRecords) => {
    if (err) {
      return cb(null, []);
    }
    // return records unique by latitude
    cb(null, uniqBy(mappedRecords, 'latitude'));
  });
}

function reverseGeocodeStations (stations, cb) {
  // reverse geocode each record made in getStations
  mapSeries(stations, (s, done) => {
    const lat = s.latitude;
    const lon = s.longitude;
    const geocodeURL = `https://search.mapzen.com/v1/reverse?api_key=${apiKey}&point.lat=${lat}&point.lon=${lon}`;
    setTimeout(() => {
      request.get({
        url: geocodeURL
      }, (err, res, geoJSON) => {
        if (err || res.statusCode !== 200) {
          return done(null, []);
        }
        makeStation(geoJSON, s, done);
      });
    }, 2000);
  }, (err, reverseGeocodedStations) => {
    if (err) {
      return cb(null, []);
    }
    cb(null, flatten(reverseGeocodedStations));
  });
}

function makeStation (geoJSON, s, done) {
  geoJSON = JSON.parse(geoJSON);
  // make station record with city/location/bounds
  if (geoJSON.features[0]) {
    let geocodeProps = getNewVals(geoJSON.features[0]);
    geocodeProps.latitude = s.latitude;
    geocodeProps.longitude = s.longitude;
    geocodeProps.stationId = s.stationId;
    return done(null, [geocodeProps]);
  } else {
    // if nothing reverse geocoded, return empty city/locatoin/bounds
    s.bounds = [];
    s.location = 'unused';
    s.city = 'unused';
    return done(null, [s]);
  }
}

function getNewVals (geoJSON) {
  // these if statements first try to add the most specific equivalent
  // for city and location provided by pelias.
  // If that doesn not exist, the next most generalized is used
  let location, region, bounds;
  const properties = geoJSON.properties;
  // get location
  if (properties.locality) {
    location = properties.locality;
  } else if (properties.localadmin) {
    location = properties.localadmin;
  } else if (properties.neighbourhood) {
    location = properties.neighbourhood;
  } else if (properties.county) {
    location = properties.county;
  } else if (properties.name) {
    location = properties.name;
  } else {
    location = 'unused';
  }
  // get city
  if (properties.region) {
    region = properties.region;
  } else if (properties.macroregion) {
    region = properties.macroregion;
  } else if (properties.macrocounty) {
    region = properties.macrocounty;
  } else if (properties.localadmin) {
    location = properties.localadmin;
  } else if (properties.neighbourhood) {
    location = properties.neighbourhood;
  } else {
    region = 'unused';
  }
  // get bounds
  if (geoJSON.bbox) {
    bounds = geoJSON.bbox;
  } else {
    bounds = [];
  }

  return {
    location: location,
    city: region,
    bounds: bounds
  };
}

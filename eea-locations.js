'use strict';

import { default as baseRequest } from 'request';
import { default as parse } from 'csv-parse/lib/sync';
import { filter, map, mapSeries, parallel } from 'async';
import { flatten, includes } from 'lodash';
import { readFile, writeFile } from 'fs';
import uniqBy from 'lodash.uniqby';
require('dotenv').config();
const request = baseRequest.defaults({timeout: 60000});
const stationFile = './eea-stations.json';
const apiKey = process.env.PELIAS_KEY;

const getCities = (cb) => {
  // get metadata records and station ids from current eea-country-locations file
  parallel([
    (done) => {
      request.get({
        url: 'http://discomap.eea.europa.eu/map/fme/metadata/PanEuropean_metadata.csv'
      }, (err, res, body) => {
        if (err || res.statusCode !== 200) {
          return done(null, []);
        }
        // grab rows for select country
        done(null, parse(body, {delimiter: '\t'}).slice(1, -1));
      });
    },
    (done) => {
      readFile('./eea-stations.json', (err, data) => {
        if (err) {
          done(null, []);
        }
        map(JSON.parse(data.toString()), (station, cb) => {
          let id;
          if (station.stationId) {
            id = station.stationId;
          } else {
            id = station;
          }
          cb(null, id);
        }, (err, stationIDs) => {
          if (err) {
            done(null, []);
          }
          done(null, stationIDs);
        });
      });
    }
  ], (err, stationData) => {
    if (err) {
      cb('err', []);
    }
    // filter metadata to only records that don't exist in our current records.
    filter(stationData[0], (record, done) => {
      done(null, !(includes(stationData[1], record[5])));
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
          cb(null, stations.concat.apply(stationData[1]));
        });
      });
    });
  });
};

const getStations = (countryMetadata, cb) => {
  // transform station rows into objects
  map(countryMetadata, (record, done) => {
    const station = {
      stationId: record[5],
      coordinates: {
        latitude: parseFloat(record[15]),
        longitude: parseFloat(record[14])
      }
    };
    done(null, station);
  }, (err, mappedRecords) => {
    if (err) {
      return cb(null, []);
    }
    cb(null, uniqBy(mappedRecords, 'stationId'));
  });
};

const reverseGeocodeStations = (stations, cb) => {
  // reverse geocode each record made in getStations
  mapSeries(stations, (s, done) => {
    const lat = s.coordinates.latitude;
    const lon = s.coordinates.longitude;
    const geocodeURL = `https://search.mapzen.com/v1/reverse?api_key=${apiKey}&point.lat=${lat}&point.lon=${lon}&layers=locality,localadmin,neighbourhood,county`;
    setTimeout(() => {
      request.get({
        url: geocodeURL
      }, (err, res, geoJSON) => {
        if (err || res.statusCode !== 200) {
          return done(null, []);
        }
        geoJSON = JSON.parse(geoJSON);
        // init the new props as just the stationId.
        // this way if nothing was returned from pelias, the stationId
        // needed in the eea-direct adapter still exists
        // and the adapter won't break
        let geocodeProps = s.stationId;
        if (geoJSON.features[0]) {
          geocodeProps = getNewVals(geoJSON.features[0]);
          geocodeProps = Object.assign(geocodeProps, s);
        }
        return done(null, [geocodeProps]);
      });
    }, 2000);
  }, (err, reverseGeocodedStations) => {
    if (err) {
      return cb(null, []);
    }
    cb('err', flatten(reverseGeocodedStations));
  });
};

getCities((err, stations) => {
  if (!err || stations.length < 0) {
    return writeFile(stationFile, stations, (err) => {
      if (err) {
        console.log(err);
      }
      console.log('New stations added!');
    });
  }
  console.log('No new stations to add!');
});

const getNewVals = (geoJSON) => {
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
  } else {
    region = 'unused';
  }
  // get bounds
  if (geoJSON.bbox) {
    bounds = geoJSON.bbox;
  } else {
    bounds = 'unused';
  }

  return {
    location: location,
    city: region,
    bounds: bounds
  };
};

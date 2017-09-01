'use strict';

import { writeFile } from 'fs';
import { initStations } from './utils/helpers';

initStations((err, stations) => {
  if (!err || stations.length < 0) {
    return writeFile('./data/eea-stations-all.json', JSON.stringify(stations), (err) => {
      if (err) {
        return console.log(err);
      }
      console.log('Reverse geocoded stations generated!');
    });
  }
  console.log('Unable to reverse geocode stations!');
});

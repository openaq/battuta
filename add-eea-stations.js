'use strict';

import { writeFile } from 'fs';
import { addStations } from './utils/helpers';

addStations((err, stations) => {
  if (!err || stations.length < 0) {
    return writeFile('./data/eea-stations-all.json', JSON.stringify(stations), (err) => {
      if (err) {
        return console.log(err);
      }
      console.log('New stations added!');
    });
  }
  console.log('No new stations to add!');
});

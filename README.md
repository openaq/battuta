# battuta
Reverse geocoding for air quality stations

### Overview

batutta checks the [metadata file](http://discomap.eea.europa.eu/map/fme/metadata/PanEuropean_metadata.csv) provided by the European Environmental Agency nightly and updates `./eea-staiton.json` when new stations are found in that metadata file.

batutta uses Mapzen's [pelias](https://github.com/pelias/pelias) for the reverse geocoding.

`./eea-stations.json` spec

```
[
  {
    "location": "Tiranë",
    "city": "Durrës",
    "bounds":[20.4004071938,40.4295094918,20.8659434619,40.7186423442],
    "stationId":"AL0203A"
  },
  ...
]
```

### Install

`$ npm install`

### For linting

`$ npm install -g jsonlint`

### Run

`$ npm run battuta`

### Ensure Valid output

`$ npm run lint-json`

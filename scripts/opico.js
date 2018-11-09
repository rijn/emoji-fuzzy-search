// put reviews csv to path/to/base/reviews.csv
const Papa = require('papaparse');
const fs = require('fs');
const path = require('path');
const Promise = require('bluebird');
const axios = require('axios');
const _ = require('lodash');
const ProgressBar = require('progress');

const raw = fs.readFileSync(path.join(__dirname, '../reviews.csv'), 'utf8');
const reviews = Papa.parse(raw, { header: true }).data;
const bar = new ProgressBar('uploading [:bar] :current/:total=:percent etas::etas', {
  complete: '=',
  incomplete: ' ',
  width: 20,
  total: _.size(reviews)
});

Promise.map(reviews, review => {
  const { id, body, EntityId } = review;
  if (!id || !body) return;
  return axios.get(`https://ipa.opico.io/entities/${EntityId}`).then(entityResponse => {
    const entity = entityResponse.data;
    const coordinates = _.get(entity, 'location.coordinates');
    const geolocation = { latitude: coordinates[0], longitude: coordinates[1] };
    const meta = { ...review, geolocation };
    const requestData = { emoji: body, meta };
    const url = 'https://opico-emoji-fuzzy-search.rijn.io/documents';
    return axios.post(url, requestData);
  }).then(() => {
    bar.tick();
  });
}, {
  concurrency: 3
}).finally(process.exit)

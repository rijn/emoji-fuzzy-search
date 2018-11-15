const { createLogger, format, transports } = require('winston');
const express = require('express');
const fs = require('fs');
const path = require('path');
const natural = require('natural');
const bodyParser = require('body-parser');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const _ = require('lodash');
const uuidv4 = require('uuid/v4');
const { loadEmojiLib, convertEmojiToKeywords, stripVariationSelectors } = require('./emoji');
const { isAscii } = require('./utils');
const geolib = require('geolib');
const Ajv = require('ajv');
const fp = require('lodash/fp');

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.splat(),
    format.simple()
  ),
  transports: [
    new transports.Console()
  ],
});

const port = '5020';

const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const emojiLib = loadEmojiLib();
const TfIdf = natural.TfIdf;
let tfidf = new TfIdf();
let meta = {};
let emojis = {};
const databasePath = path.resolve(__dirname, '../database.json');
if (fs.existsSync(databasePath)) {
  const data = fs.readFileSync(databasePath, 'utf8');
  const o = JSON.parse(data);
  meta = o.meta;
  emojis = o.emojis;
  tfidf = new TfIdf(o.tfidf);
}

const ajv = new Ajv();

const documentPostSchema = {
  properties: {
    emoji: {
      type: 'string'
    },
    meta: { oneOf: [
      {
        type: 'object',
        properties: {
          geolocation: { oneOf: [ 
            { type: 'object',
              properties: {
                latitude: { type: 'number' },
                longitude: { type: 'number' }
              },
              required: [ 'latitude', 'longitude' ],
              additionalProperties: false
            },
            { type: 'null' }
          ] }
        }
      },
      { type: 'null' }
    ] }
  },
  required: [ 'emoji' ]
}
const documentPostValidate = ajv.compile(documentPostSchema);

/**
 * @params
 *   emoji
 *   geolocation: shape of { latitude, longitude }
 */
app.post('/documents', (req, res) => {
  var valid = documentPostValidate(req.body);
  if (!valid) {
    res.status(400).json(documentPostValidate.errors).end();
    return;
  }
  const { emoji, meta: _meta, geolocation } = req.body || {};
  const key = uuidv4();
  tfidf.addDocument(convertEmojiToKeywords(emojiLib, emoji).join(' '), key);
  meta[key] = _meta;
  emojis[key] = emoji;

  fs.writeFileSync(databasePath, JSON.stringify({ meta, tfidf, emojis }), 'utf8');

  res.status(201).end();
});

const searchSchema = {
  properties: {
    limit: {
      type: 'number'
    },
    geofence: {
      type: 'object',
      oneOf: [ {
        properties: {
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          radius: { type: 'number' }
        },
        required: [ 'latitude', 'longitude', 'radius' ],
        additionalProperties: false
      }, {
        properties: {
          latitude: { type: 'number' },
          longitude: { type: 'number' },
          latitudeDelta: { type: 'number' },
          longitudeDelta: { type: 'number' }
        },
        required: [ 'latitude', 'longitude', 'latitudeDelta', 'longitudeDelta' ],
        additionalProperties: false
      } ]
    }
  }
}
const searchValidate = ajv.compile(searchSchema);

app.get('/search/:query', (req, res) => {
  const params = req.query;
  if (_.has(params, 'geofence')) params.geofence = JSON.parse(params.geofence);
  var valid = searchValidate(params);
  if (!valid) {
    res.status(400).json(searchValidate.errors).end();
    return;
  }
  const { query } = req.params || {};
  const { limit, geofence, enableFuzzySearch, truncateSmallMatch } = _.defaults(params, {
    limit: 100,
    enableFuzzySearch: false,
    truncateSmallMatch: true
  });
  const kws = isAscii(query) ? query : convertEmojiToKeywords(emojiLib, query).join(' ');
  let result = {};
  let measure1Sum = 0;
  tfidf.tfidfs(kws, (i, measure, key) => {
    measure1Sum += measure;
    result[key] = { meta: meta[key], measure1: measure, emoji: emojis[key] };
  });
  result = _.map(result, term => ({ ...term, measure1: term.measure1 / measure1Sum }));

  // test n-gram
  if (!isAscii(query)) {
    const querySplitted = _.split(query, '');
    const subsets = _.chain([...Array(querySplitted.length).keys()])
      .map(start => _.map([...Array(querySplitted.length - start).keys()], offset => ({ start, length: offset + 1 })))
      .flatten()
      .map(({ start, length }) => querySplitted.slice(start, start + length))
      .map(fp.join(''))
      .sortBy('length')
      .value();
    const subsetLengthSum = _.chain(subsets).map(fp.size).sum().value();
    _.each(result, term => {
      let match = '';
      term.measure2 = _.chain(subsets)
        .map(subset => {
          if (_.includes(stripVariationSelectors(term.emoji), stripVariationSelectors(subset))) {
            match = _.maxBy([ subset, match ], 'length');
            return _.size(subset);
          }
          return 0;
        })
        .sum()
        .divide(subsetLengthSum)
        .value();
      term.match = match;
    });
  }

  const maxMatchLength = _.chain(result).map('match').map(fp.size).max().value();

  const filterIsPointInside = geofence && !_.has(geofence, 'radius')
    ? item => !_.has(item, 'meta.geolocation') || geolib.isPointInside(item.meta.geolocation, [
      { latitude: geofence.latitude - geofence.latitudeDelta, longitude: geofence.longitude - geofence.longitudeDelta },
      { latitude: geofence.latitude + geofence.latitudeDelta, longitude: geofence.longitude - geofence.longitudeDelta },
      { latitude: geofence.latitude + geofence.latitudeDelta, longitude: geofence.longitude + geofence.longitudeDelta },
      { latitude: geofence.latitude - geofence.latitudeDelta, longitude: geofence.longitude + geofence.longitudeDelta }
    ] )
    : () => true;
  const filterIsPointInCircle = geofence && _.has(geofence, 'radius')
    ? item => !_.has(item, 'meta.geolocation') || geolib.isPointInCircle(item.meta.geolocation, geofence, geofence.radius)
    : () => true;
  const filterSmallMatch = truncateSmallMatch ? o => _.size(o.match) === maxMatchLength : () => true;

  if (!enableFuzzySearch) _.each(result, term => term.measure1 = 0);

  result = _.chain(result)
    .map(o => ({ ...o, measure: _.sum([ o.measure1 || 0, o.measure2 || 0 ]) }))
    .filter(o => !!o.measure)
    .filter(filterIsPointInside)
    .filter(filterIsPointInCircle)
    .filter(filterSmallMatch)
    .sortBy('measure')
    .reverse()
    .take(limit)
    .value()
  res.json(result);
})

const server = app.listen(port);

process.on('unhandledRejection', (reason, p) =>
  logger.error('Unhandled Rejection at: Promise ', p, reason)
);

server.on('listening', () =>
  logger.info('Application started on http://localhost:%d', port)
);

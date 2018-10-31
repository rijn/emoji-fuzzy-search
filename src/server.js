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
const { loadEmojiLib, convertEmojiToKeywords } = require('./emoji');
const { isAscii } = require('./utils');

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

app.post('/documents', (req, res) => {
  const { emoji, meta: _meta } = req.body || {};
  const key = uuidv4();
  tfidf.addDocument(convertEmojiToKeywords(emojiLib, emoji)[0], key);
  meta[key] = _meta;
  emojis[key] = emoji;

  fs.writeFileSync(databasePath, JSON.stringify({ meta, tfidf, emojis }), 'utf8');

  res.status(201).end();
});

app.get('/search/:query', (req, res) => {
  const { query } = req.params || {};
  const { limit } = _.defaults(req.query, { limit: 10 });
  const kws = isAscii(query) ? query : convertEmojiToKeywords(emojiLib, query)[0];
  let result = {};
  tfidf.tfidfs(kws, (i, measure, key) => {
    result[key] = { meta: meta[key], measure, emoji: emojis[key] };
  });
  result = _.chain(result)
    .values()
    .filter(o => !!o.measure)
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

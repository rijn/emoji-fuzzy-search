const Papa = require('papaparse');
const _ = require('lodash');
const emojiDatasource = require('emoji-datasource-apple');
const fp = require('lodash/fp');
const fs = require('fs');

const loadEmojiLib = () => {
  return _.chain(emojiDatasource)
    .map((v) => ({
        char: String.fromCodePoint.apply(
            null,
            v.unified.split('-').map(v => `0x${v}`)
        ),
        key: v.short_name,
        keywords: _.join(_.union([ _.isEmpty(v.name) ? v.short_name : v.name ], v.short_names), ' '),
        lib: v
    }))
    .keyBy('char')
    .value();
};

const customEmojiUnicodeMap = {
  [ decodeURI('%E2%98%95%EF%B8%8F') ]: decodeURI('%E2%98%95')
};

const convertEmojiToKeywords = (emojiLib, emoji) => {
  return _.chain(emoji)
    .split('')
    .map(emoji => [ _.get(emojiLib, [ _.get(customEmojiUnicodeMap, emoji) || emoji, 'keywords' ]) ])
    .flatten()
    .value();
};

const loadReactionData = (emojiLib) => {
  const raw = fs.readFileSync('reactions.csv', 'utf8');
  const csv = Papa.parse(raw, { header: true });
  const reactions = _.chain(csv)
    .get('data')
    .map(fp.omit([ 'name', 'userId' ]))
    .map(reaction => {
      reaction.keywords = _.chain(reaction)
        .get('id')
        .split('')
        .map(emoji => convertEmojiToKeywords(emojiLib, emoji))
        .join(' ')
        .split(' ')
        .compact()
        .value();
      return reaction;
    })
    .value();
  return reactions;
};

module.exports = { loadEmojiLib, convertEmojiToKeywords, loadReactionData };
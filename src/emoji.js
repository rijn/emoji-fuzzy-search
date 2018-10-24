import Papa from 'papaparse';
import _ from 'lodash';
import emojiDatasource from 'emoji-datasource-apple';
import fp from 'lodash/fp';
import fs from 'fs';

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

const convertEmojiToKeywords = (emojiLib, emoji) => {
  return _.chain(emoji)
    .split('')
    .map(emoji => [ _.get(emojiLib, [ emoji, 'keywords' ]) ])
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

export { loadEmojiLib, convertEmojiToKeywords, loadReactionData };
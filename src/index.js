import Fuse from 'fuse.js';
import Papa from 'papaparse';
import _ from 'lodash';
import clear from 'clear';
import emojiDatasource from 'emoji-datasource-apple';
import fp from 'lodash/fp';
import fs from 'fs';
import inquirer from 'inquirer';
import whilst from 'async/whilst';
import EventEmitter from 'events';

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

const promptQuery = () => {
  const questions = [
    {
      name: "query",
      type: "input",
      message: "The search query?"
    }
  ];
  return inquirer.prompt(questions);
};

const promptFeedback = () => {
  const questions = [
    {
      name: "feedback",
      type: "confirm",
      message: "Continue?"
    }
  ];
  return inquirer.prompt(questions);
};

const fuseOptions = {
  shouldSort: true,
  tokenize: true,
  matchAllTokens: true,
  includeScore: true,
  threshold: 0.6,
  keys: [ 'keywords', 'id' ],
  id: 'id'
};

const getAllSubsets = theArray => theArray.reduce(
  (subsets, value) => subsets.concat(
    subsets.map(set => [value,...set])
  ),
  [[]]
);

const isAscii = str => {
  return /^[\x00-\x7F]*$/.test(str);
};

const main = async () => {
  const emojiLib = loadEmojiLib();
  const reactions = loadReactionData(emojiLib);
  const fuse = new Fuse(reactions, fuseOptions);
  let _feedback = true;
  await whilst(
    () => _feedback,
    async () => {
      clear();

      const { query } = await promptQuery();

      let subsets;
      if (isAscii(query)) {
        subsets = [ _.split(query, ' ') ];
      } else {
        subsets = _.split(query, '').length > 1
          ? getAllSubsets(_.split(query, ''))
            .filter(a => !_.isEmpty(a))
            // .filter(a => a.length > 1)
          : [ _.split(query, '') ];
      }

      const size = subsets.length;

      console.log(subsets);

      const searchMap = {};

      const result = _.chain(subsets)
        .map(subset => {
          const kws = isAscii(subset.join('')) ? subset : convertEmojiToKeywords(emojiLib, subset.join(''));
          const _kws = _.chain(kws).compact().join(' ').value();

          console.log(_kws);

          if (!searchMap[_kws]) {
            searchMap[_kws] = true;
          } else {
            return [];
          }

          let result = fuse.search(_kws);

          return result;
        })
        .flatten()
        .groupBy('item')
        .map((objs, key) => ({
          'item': key,
          'score': _.sumBy(objs, 'score') / size
        }))
        .sortBy('score')
        .take(20)
        .value();

      console.log(result);

      const { feedback } = await promptFeedback();
      _feedback = feedback;
    }
  );
};

main();

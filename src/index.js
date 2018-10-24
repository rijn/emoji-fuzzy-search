import { BayseClassifier, FuseClassifier, TfIdfClassifier } from './classifiers';
import { convertEmojiToKeywords, loadEmojiLib, loadReactionData } from './emoji';
import { getAllSubsets, isAscii } from './utils';

import Enum from 'enum';
import EventEmitter from 'events';
import _ from 'lodash';
import clear from 'clear';
import fp from 'lodash/fp';
import inquirer from 'inquirer';
import natural from 'natural';
import whilst from 'async/whilst';

Enum.register();

const CLASSIFICATION_METHODS = new Enum([ 'FUSE', 'BAYSE', 'TF_IDF' ]);
const CLASSIFICATION_METHOD = CLASSIFICATION_METHODS.TF_IDF;

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

const main = async () => {
  const emojiLib = loadEmojiLib();
  const reactions = loadReactionData(emojiLib);

  let classifier;

  switch (CLASSIFICATION_METHOD) {
    case CLASSIFICATION_METHODS.BAYSE:
      classifier = new BayseClassifier(reactions);
      break;
    case CLASSIFICATION_METHODS.FUSE:
      classifier = new FuseClassifier(reactions); 
      break;
    case CLASSIFICATION_METHODS.TF_IDF:
      classifier = new TfIdfClassifier(reactions);
      break;
  }

  let _feedback = true;
  await whilst(
    () => _feedback,
    async () => {
      clear();

      const { query } = await promptQuery();

      if (!query) return;

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

          const result = classifier.classify(_kws);

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

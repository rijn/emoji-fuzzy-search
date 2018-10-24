import BaseClassifier from 'base';
import _ from 'lodash';
import natural from 'natural';

class BayseClassifier extends BaseClassifier {
  constructor (reactions) {
    super(reactions);

    this.bayse = new natural.BayesClassifier();
    _.each(reactions, reaction => {
      this.bayse.addDocument(reaction.keywords, reaction.id);
    });
    this.bayse.train();
  }

  classify (query) {
    const result = _.chain(this.bayse.getClassifications(query))
      .map(({ label, value }) => ({ item: label, score: value }))
      .value();
    return result;
  }
}

export default BayseClassifier;
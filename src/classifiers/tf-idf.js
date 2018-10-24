import BaseClassifier from 'base';
import _ from 'lodash';
import natural from 'natural';

class TfIdfClassifier extends BaseClassifier {
  constructor (reactions) {
    super(reactions);

    this.reactions = reactions;

    const TfIdf = natural.TfIdf;

    this.tfidf = new TfIdf();
    _.each(reactions, reaction => {
      this.tfidf.addDocument(reaction.keywords, reaction.id);
    });
  }

  classify (query) {
    const result = [];
    this.tfidf.tfidfs(query, (i, measure) => {
      result[i] = { item: this.reactions[i].id, score: - measure };
    });
    return result;
  }
}

export default TfIdfClassifier;
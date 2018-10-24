import BaseClassifier from 'base';
import Fuse from 'fuse.js';
import _ from 'lodash';

const fuseOptions = {
  shouldSort: true,
  tokenize: true,
  matchAllTokens: true,
  includeScore: true,
  threshold: 0.6,
  keys: [ 'keywords', 'id' ],
  id: 'id'
};

class FuseClassifier extends BaseClassifier {
  constructor (reactions) {
    super(reactions);

    this.fuse = new Fuse(reactions, fuseOptions);
  }

  classify (query) {
    const result = this.fuse.search(query);
    return result;
  }
}

export default FuseClassifier;
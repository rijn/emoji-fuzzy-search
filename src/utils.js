const getAllSubsets = theArray => theArray.reduce(
  (subsets, value) => subsets.concat(
    subsets.map(set => [value,...set])
  ),
  [[]]
);

const isAscii = str => {
  return /^[\x00-\x7F]*$/.test(str);
};

export { getAllSubsets, isAscii };
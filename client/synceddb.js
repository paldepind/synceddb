'use strict';

const dffptch = require('dffptch');
const SDBDatabase = require('./src/sdbdatabase');

const patch = dffptch.patch;

const diff = dffptch.diff;

const open = (opts) => {
  return new SDBDatabase(opts);
};

module.exports = {patch, diff, open};

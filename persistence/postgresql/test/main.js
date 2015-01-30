var pgPersistence = require('../index');
var Tests = require('../../persistence-tests');

var opts = {
  conString: 'postgres://postgres@localhost/synceddb',
};

Tests.testPersistence(pgPersistence.bind(null, opts));

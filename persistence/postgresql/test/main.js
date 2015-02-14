var pgPersistence = require('../index');
var Tests = require('../../persistence-tests');

var opts = {
  conString: 'postgres://postgres@localhost/synceddb',
};

Tests.testPersistence(pgPersistence.create.bind(null, opts));

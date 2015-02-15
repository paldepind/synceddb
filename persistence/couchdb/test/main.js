var couchdbPersistence = require('../index');
var Tests = require('../../persistence-tests');

var opts = {
  dbUrl: 'http://synceddb:mypass@localhost:5984/synceddb/',
};

Tests.testPersistence(couchdbPersistence.create.bind(null, opts));

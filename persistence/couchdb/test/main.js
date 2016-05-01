const couchdbPersistence = require('../index');
const Tests = require('../../persistence-tests');

const opts = {
  dbUrl: 'http://synceddb:mypass@localhost:5984/synceddb/',
};

Tests.testPersistence(couchdbPersistence.create.bind(null, opts));

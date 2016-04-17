const pgPersistence = require('../index');
const Tests = require('../../persistence-tests');

const opts = {
  conString: 'postgres://postgres@localhost/synceddb',
};

Tests.testPersistence(pgPersistence.create.bind(null, opts));

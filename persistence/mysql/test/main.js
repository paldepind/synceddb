var mysqlPersistence = require('../index');
var Tests = require('../../persistence-tests');

var opts = {
  host: 'localhost',
  user: 'synceddb',
  password: 'mypass',
  database: 'synceddb',
};

Tests.testPersistence(mysqlPersistence.create.bind(null, opts));

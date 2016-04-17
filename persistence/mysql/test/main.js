const mysqlPersistence = require('../index');
const Tests = require('../../persistence-tests');

const opts = {
  host: 'localhost',
  user: 'synceddb',
  password: 'mypass',
  database: 'synceddb',
};

Tests.testPersistence(mysqlPersistence.create.bind(null, opts));

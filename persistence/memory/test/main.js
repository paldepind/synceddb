const MemoryPersistence = require('../index');
const Tests = require('../../persistence-tests');

Tests.testPersistence(MemoryPersistence.create);

var assert = require('assert');

function testPersistence(Persistence) {
  describe('Persistence', function() {
    var store;
    beforeEach(function() {
      return (store = new Persistence());
    });
    afterEach(function() {
      return store.resetChanges();
    });
    it('can save and get change to store', function() {
      return store.saveChange({
        type: 'create',
        storeName: 'animals',
        clientId: 1,
        record: {name: 'Thumper', key: 1},
      }).then(function() {
        return store.getChanges({
          since: null,
          clientId: 2,
          storeName: 'animals',
        });
      }).then(function(result) {
        assert.equal(result.length, 1);
      });
    });
    it('only get changes from other clients', function() {
      return store.saveChange({
        type: 'create',
        storeName: 'animals',
        clientId: 1,
        record: {name: 'Thumper', key: 1},
      }).then(function() {
        return store.saveChange({
          type: 'create',
          storeName: 'animals',
          clientId: 2,
          record: {name: 'Cuddley', key: 2},
        });
      }).then(function() {
        return store.getChanges({
          since: null,
          clientId: 2,
          storeName: 'animals',
        });
      }).then(function(result) {
        assert.equal(result.length, 1);
      });
    });
  });
}

exports.testPersistence = testPersistence;

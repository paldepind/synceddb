var assert = require('assert');

function testPersistence(create) {
  describe('Persistence', function() {
    var store;
    beforeEach(function() {
      return  create().then(function(s) {
        store = s;
      });
    });
    afterEach(function() {
      return store.resetChanges();
    });
    it('storing create change adds timestamp and version', function() {
      return store.saveChange({
        type: 'create',
        storeName: 'animals',
        record: {name: 'Thumper'},
        key: 1,
      }).then(function(change) {
        assert.notEqual(change.key, undefined);
        assert.notEqual(change.timestamp, undefined);
        assert.notEqual(change.version, undefined);
      });
    });
    it('storing update change adds timestamp and new version', function() {
      return store.saveChange({
        type: 'update',
        storeName: 'animals',
        clientId: 1,
        diff: {m: {'3': true}},
        version: 0,
        key: 1,
      }).then(function(change) {
        assert.notEqual(change.timestamp, undefined);
        assert.notEqual(change.version, undefined);
      });
    });
    it('can save and get change to store', function() {
      var key;
      return store.saveChange({
        type: 'create',
        storeName: 'tasks',
        record: {
           description: 'Fix bug',
           finished: false,
           createdAt: 1423685389538,
        },
        key: 0,
      }).then(function(change) {
        key = change.key;
        var version = change.version;
        return store.saveChange({
          type: 'update',
          storeName: 'tasks',
          diff: { m: { '3': true } },
          key: key,
          version: version,
        });
      }).then(function() {
        return store.getChanges({
          since: null,
          storeName: 'tasks',
        });
      }).then(function(result) {
        assert.equal(result.length, 2);
        assert.equal(result[0].type, 'create');
        assert.equal(result[0].storeName, 'tasks');
        assert.notEqual(result[0].record, undefined);
        assert.notEqual(result[0].timestamp, undefined);
        assert.notEqual(result[0].version, undefined);
        assert.equal(result[0].record.description, 'Fix bug');
        assert.equal(result[1].type, 'update');
        assert.equal(result[1].storeName, 'tasks');
        assert.notEqual(result[0].timestamp, undefined);
        assert.notEqual(result[1].diff, undefined);
        assert.equal(result[1].key, key);
        assert.notEqual(result[1].version, undefined);
      });
    });
    it('sending several changes in a row generates unique keys', function(done) {
      var called = 0;
      var keys = [];
      var secondChangeTimestamp;
      var change1 = { type: 'create', storeName: 'animals', record: { name: 'Thumper' }, key: 0, };
      var change2 = { type: 'create', storeName: 'animals', record: { name: 'Thumper' }, key: 0, };
      var change3 = { type: 'create', storeName: 'animals', record: { name: 'Thumper' }, key: 0, };
      function handle(change) {
        keys.push(change.key);
        if (keys.length === 3) {
          assert.notEqual(keys[0], keys[1]);
          assert.notEqual(keys[1], keys[2]);
          done();
        }
      }
      store.saveChange(change1).then(handle);
      store.saveChange(change2).then(handle);
      store.saveChange(change3).then(handle);
    });
    it('only returns changes after timestamp', function() {
      var key;
      var secondChangeTimestamp;
      var change = {
        type: 'create',
        storeName: 'animals',
        record: { name: 'Thumper' },
        key: 0,
      };
      return store.saveChange(change).then(function() {
        return store.saveChange(change);
      }).then(function(change) {
        secondChangeTimestamp = change.timestamp;
        return store.saveChange(change);
      }).then(function() {
        return store.getChanges({
          since: secondChangeTimestamp,
          storeName: 'animals',
        });
      }).then(function(result) {
        assert.equal(result.length, 1);
      });
    });
  });
}

exports.testPersistence = testPersistence;

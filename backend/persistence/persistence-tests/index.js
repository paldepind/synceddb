function testPersistence(Persistence) {
  describe('Memory persistence', function() {
    var store;
    beforeEach(function() {
      store = new Persistence();
    });
    it('saves changes to store', function() {
      store.saveChange({
        type: 'create',
        storeName: 'animals',
        clientId: 'foo',
        record: {name: 'Thumper'},
      });
    });
  });
}

exports.testPersistence = testPersistence;

const sinon = require('sinon');
const assert = require('assert');

describe('SyncedDB', () => {
  const stores = {
    animals: [
      ['byColor', 'color'],
      ['byName', 'name', {unique: true}],
    ],
    roads: [
      ['byLength', 'length'],
    ],
    houses: [
      ['byStreet', 'street'],
    ],
  };
  afterEach(done => {
    const req = indexedDB.deleteDatabase('mydb');
    req.onblocked = () => { };
    req.onsuccess = () => { done(); };
  });
  describe('Opening a database', () => {
    let db;
    beforeEach(() => {
      db = syncedDB.open({name: 'mydb', version: 1, stores});
    });
    it('return promise resolved with db and event', done => {
      syncedDB.open({name:'mydb', version: 1, stores: []}).then(res => {
        assert(res.db.db instanceof IDBDatabase);
        assert(res.e.type === 'success');
        done();
      });
    });
    it('creates database with specified version', done => {
      const spy = sinon.spy();
      syncedDB.open({name:'mydb', version: 1, stores: []}).then(() => {
        const req = indexedDB.open('mydb', 1);
        req.onupgradeneeded = spy;
        req.onsuccess = () => {
          const db = req.result;
          assert(spy.notCalled);
          db.close();
          done();
        };
      });
    });
    it('creates object stores', done => {
      db.then(() => {
        const req = indexedDB.open('mydb', 1);
        req.onsuccess = () => {
          const db = req.result;
          const stores = db.objectStoreNames;
          assert(stores.length === 4);
          assert(stores.contains('animals'));
          assert(stores.contains('roads'));
          assert(stores.contains('houses'));
          db.close();
          done();
        };
      });
    });
    it('handles object store parameters', done => {
      db.then(() => {
        const req = indexedDB.open('mydb', 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['animals', 'houses', 'roads']);
          const animals = tx.objectStore('animals');
          const roads = tx.objectStore('roads');
          const houses = tx.objectStore('houses');
          assert.equal(animals.keyPath, 'key');
          assert.equal(animals.autoIncrement, false);
          assert(roads.keyPath === 'key');
          assert(roads.autoIncrement === false);
          assert(houses.keyPath === 'key');
          assert(houses.autoIncrement === false);
          db.close();
          done();
        };
      });
    });
    it('creates indexes ', done => {
      db.then(() => {
        const req = indexedDB.open('mydb', 1);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['animals', 'roads']);

          const animals = tx.objectStore('animals');
          const byColor = animals.index('byColor');
          const byName = animals.index('byName');
          const roads = tx.objectStore('roads');
          const byLength = roads.index('byLength');

          assert(byColor.keyPath === 'color');
          assert(!byColor.unique);
          assert(byName.keyPath === 'name');
          assert(byName.unique);
          assert(byLength.keyPath === 'length');
          assert(!byLength.unique);

          db.close();
          done();
        };
      });
    });
    it('handles migrations with added stores', done => {
      db.then(() => {
        const stores2 = {animals: stores.animals, roads: stores.roads, houses: stores.houses};
        stores2.books = [['byAuthor', 'author']];
        return syncedDB.open({name: 'mydb', version: 2, stores: stores2});
      }).then(() => {
        done();
      });
    });
    it('handles migrations with added indexes', done => {
      const stores2 = {
        animals: [
          ['byColor', 'color'],
          ['byName', 'name'],
          ['bySpecies', 'species'], // New
        ],
        roads: [
          ['byLength', 'length'],
          ['byCost', 'cost'], // New
        ],
        houses: [
          ['byStreet', 'street'],
        ]
      };
      db.then(() => syncedDB.open({name: 'mydb',
                            version: 2,
                            stores: stores2})).then(() => {
        done();
      });
    });
    it('calls migration hooks with db and e', done => {
      const m1 = sinon.spy();
      const m2 = sinon.spy();
      const m3 = sinon.spy();
      const migrations = {
        1: m1,
        2: m2,
        3: m3,
      };
      syncedDB.open({name: 'another', version: 1,
                    stores, migrations})
      .then(() => {
        assert(m1.firstCall.args[0] instanceof IDBDatabase);
        assert(m1.firstCall.args[1].type === 'upgradeneeded');
        assert(m2.notCalled);
        assert(m3.notCalled);
        return syncedDB.open({name: 'another', version: 3,
                              stores, migrations});
      }).then(() => {
        assert(m2.calledOnce);
        assert(m3.calledOnce);
        assert(m3.firstCall.args[0] instanceof IDBDatabase);
        assert(m3.firstCall.args[1].type === 'upgradeneeded');
        const req = indexedDB.deleteDatabase('another');
        req.onsuccess = () => { done(); };
      });
    });
  });
  describe('Database', () => {
    it('is exposes stores', done => {
      const db = syncedDB.open({name: 'mydb', version: 1, stores});
      db.then(db => {
        done();
      });
      assert(typeof db.animals === 'object');
      assert(typeof db.stores.animals === 'object');
      assert(typeof db.animals.byColor === 'object');
      assert(typeof db.animals.byName === 'object');
      assert(typeof db.stores.roads === 'object');
      assert(typeof db.roads.byLength === 'object');
      assert(typeof db.stores.houses === 'object');
    });
  });
  describe('Transaction', () => {
    let db;
    beforeEach(() => {
      db = syncedDB.open({name: 'mydb', version: 1, stores});
    });
    it('gives requested stores', done => {
      db.read('roads', 'houses', (roads, houses) => {
        assert(roads);
        assert(houses);
      }).then(() => {
        done();
      });
    });
    it('can put and get', done => {
      const road = {length: 100, price: 1337};
      const house = {street: 'Somewhere', built: 1891};
      db.write('roads', 'houses', (roads, houses) => {
        roads.put(road);
        houses.put(house);
      }).then(() => db.houses.get(house.key)).then(somewhere => {
        assert.equal(somewhere.built, 1891);
        return db.roads.get(road.key);
      }).then(road => {
        assert(road.length === 100);
        done();
      });
    });
    it('can put several records at once', done => {
      const road1 = {length: 100, price: 1337};
      const road2 = {length: 200, price: 2030};
      db.write('roads', roads => {
        roads.put(road1, road2);
      }).then(() => db.roads.get(road1.key)).then(r1 => {
        assert(r1.length === 100);
        return db.roads.get(road2.key);
      }).then(r2 => {
        assert(r2.length === 200);
        done();
      });
    });
    it('throws if putting with invalid key', done => {
      const road = {length: 100, price: 1337, key() {}};
      db.write('roads', (roads, houses) => {
        roads.put(road);
      }).catch(err => {
        assert(err instanceof TypeError);
        done();
      });
    });
    it('can get several records at once', done => {
      let foundRoads;
      db.write('roads', roads => {
        const road1 = {length: 100, price: 1337};
        const road2 = {length: 200, price: 2030};
        roads.put(road1, road2).then(() => {
          roads.get(road1.key, road2.key).then(found => {
            foundRoads = found;
          });
        });
      }).then(() => {
        assert(foundRoads[0].length === 100);
        assert(foundRoads[1].length === 200);
        done();
      });
    });
    it('support promise chaining with simple values', done => {
      let key;
      const road = {length: 100, price: 1337};
      db.write('roads', roads => {
        roads.put(road)
        .then(() => road).then(road => {
          key = road.key;
        });
      }).then(() => {
        assert(key);
        done();
      });
    });
    it('is possible to put and then get in promise chain', done => {
      const road = {length: 100, price: 1337};
      db.transaction('roads', 'rw', roads => {
        roads.put(road)
        .then(() => roads.get(road.key)).then(road => {
          assert(road.price === 1337);
          done();
        });
      });
    });
    it('is possible to get and then put', done => {
      const road = {length: 100, price: 1337};
      db.roads.put(road).then(() => {
        db.transaction('roads', 'rw', roads => {
          roads.get(road.key).then(r => {
            r.length = 110;
            roads.put(r);
          });
        }).then(() => db.roads.get(road.key)).then(r => {
          assert.equal(r.length, 110);
          done();
        });
      });
    });
    describe('Indexes', () => {
      it('can get records by indexes', done => {
        let road = {length: 100, price: 1337};
        db.roads.put(road)
        .then(() => db.transaction('roads', 'r', roads => {
          roads.byLength.get(100)
          .then(roads => {
            road = roads[0];
          });
        }).then(() => {
          assert.equal(road.price, 1337);
          done();
        }));
      });
      it('can get by indexes and continue in transaction', done => {
        let road1, road2;
        const road = {length: 100, price: 1337};
        db.roads.put(road)
        .then(() => db.transaction('roads', 'r', roads => {
          roads.byLength.get(100)
          .then(foundRoads => {
            road1 = foundRoads[0];
            roads.get(road1.key).then(r => {
              road2 = r;
            });
          });
        }).then(() => {
          assert.equal(road1.price, 1337);
          assert.equal(road2.price, 1337);
          done();
        }));
      });
      it('can get records by index in a specified range', done => {
        let foundHouses;
        db.houses.put({street: 'Somewhere 1'},
                      {street: 'Somewhere 2'},
                      {street: 'Somewhere 3'},
                      {street: 'Somewhere 4'}
        ).then(() => db.transaction('houses', 'r', houses => houses.byStreet.inRange({gt: 'Somewhere 2', lte: 'Somewhere 4'})
          .then(houses => { foundHouses = houses; }))).then(() => {
          assert(foundHouses.length === 2);
          done();
        });
      });
    });
  });
  describe('Store', () => {
    let db;
    beforeEach(() => {
      db = syncedDB.open({name: 'mydb', version: 1, stores});
    });
    it('can get records by key', done => {
      let IDBDb;
      db.then(db => {
        const req = indexedDB.open('mydb', 1);
        req.onsuccess = () => {
          IDBDb = req.result;
          const tx = IDBDb.transaction('roads', 'readwrite');
          const roads = tx.objectStore('roads');
          roads.add({length: 10, key: 'road1'});
          tx.oncomplete = postAdd;
        };
      });
      function postAdd() {
        db.roads.get('road1').then(road1 => {
          assert(road1.length === 10);
          IDBDb.close();
          done();
        });
      }
    });
    it('rejects when key not found', done => {
      db.roads.get('someKey')
      .catch(err => {
        assert.equal(err.type, 'KeyNotFoundError');
        done();
      });
    });
    it('can get several records by key', done => {
      let IDBDb;
      db.then(db => {
        const req = indexedDB.open('mydb', 1);
        req.onsuccess = () => {
          IDBDb = req.result;
          const tx = IDBDb.transaction('roads', 'readwrite');
          const roads = tx.objectStore('roads');
          roads.add({length: 10, key: 'road1'});
          roads.add({length: 20, key: 'road2'});
          tx.oncomplete = postAdd;
        };
      });
      function postAdd() {
        db.roads.get('road1', 'road2').then(roads => {
          assert(roads[0].length === 10);
          assert(roads[1].length === 20);
          IDBDb.close();
          done();
        });
      }
    });
    it('can put record with key', done => {
      const house = {street: 'Somewhere 8', built: 1993};
      db.houses.put(house).then(() => db.houses.get(house.key)).then(house => {
        assert(house.built === 1993);
        done();
      });
    });
    it('puts several already saved records in series', done => {
      let got = 0;
      function doneWhen() {
        got++;
        if (got === 2) done();
      }
      const house1 = {street: 'Somewhere 7', built: 1993};
      const house2 = {street: 'Somewhere 8', built: 1995};
<<<<<<< 3d8f46fbeaa6abee9dce4b6f64e7f7e9b384ebb4
      db.houses.put(house1, house2).then(function() {
=======
      db.houses.put(house1, house2).then(() => {
        console.log('put em');
>>>>>>> 2015ify test dir
        db.houses.put(house1).then(doneWhen);
        db.houses.put(house2).then(doneWhen);
      });
    });
    it('synchronously adds key and sync status', done => {
      const house = {street: 'Somewhere 8', built: 1993};
      let syncKey;
      db.houses.put(house).then(keys => {
        assert.equal(syncKey, keys[0]);
        return db.houses.get(house.key);
      }).then(house => {
        assert(house.built === 1993);
        done();
      });
      syncKey = house.key;
      assert.equal(house.changedSinceSync, 1);
    });
    it('can put several records at once', done => {
      const houses = [{street: 'Somewhere 7', built: 1982},
                    {street: 'Somewhere 8', built: 1993},
                    {street: 'Somewhere 9', built: 2001}];
      db.houses.put(houses[0], houses[1], houses[2])
      .then(() => db.houses.get(houses[0].key)).then(house => {
        assert(house.built === 1982);
        return db.houses.get(houses[1].key);
      }).then(house => {
        assert(house.built === 1993);
        return db.houses.get(houses[2].key);
      }).then(house => {
        assert(house.built === 2001);
        done();
      });
    });
    it('can delete record by key', done => {
      let key;
      db.houses.put({street: 'Somewhere 7', built: 1982}).then(insertKeys => {
        key = insertKeys[0];
        return db.houses.delete(key);
      }).then(house => db.houses.get(key)).catch(err => {
        done();
      });
    });
    it('can delete several records by key', done => {
      let keys;
      db.houses.put(
          {street: 'Somewhere 7', built: 1982},
          {street: 'Somewhere 8', built: 1985}
      ).then(insertKeys => {
        keys = insertKeys;
        return db.houses.delete(insertKeys[0], insertKeys[1]);
      }).then(house => db.houses.get(keys[0])).catch(err => db.houses.get(keys[1])).catch(err => {
        done();
      });
    });
    describe('Index', () => {
      let db, put, animals;
      beforeEach(() => {
        db = syncedDB.open({name: 'mydb', version: 1, stores});
        animals = db.animals;
        put = animals.put({name: 'Thumper', race: 'rabbit', color: 'brown'},
                          {name: 'Fluffy', race: 'rabbit', color: 'white'},
                          {name: 'Bella', race: 'dog', color: 'white'});
      });
      it('supports getting by unique index', done => {
        put.then(() => animals.byName.get('Thumper')).then(thumpers => {
          assert.equal(thumpers[0].race, 'rabbit');
          assert.equal(thumpers[0].color, 'brown');
          done();
        });
      });
      it('can get multiple records', done => {
        put.then(() => animals.byColor.get('white')).then(animals => {
          assert(animals[0].name == 'Bella' ? animals[1].name == 'Fluffy'
                                            : animals[1].name == 'Bella');
          done();
        });
      });
      it('can get all records', done => {
        db.houses.put({street: 'Somewhere 7', built: 1982},
                      {street: 'Somewhere 8', built: 1993},
                      {street: 'Somewhere 9', built: 2001})
        .then(putKeys => db.houses.byStreet.getAll()).then(allHouses => {
          assert.equal(allHouses.length, 3);
          done();
        });
      });
      it('returns an array if store isnt unique', done => {
        put.then(() => animals.byColor.get('brown')).then(brownAnimals => {
          assert(brownAnimals.length === 1);
          done();
        });
      });
    });
  });
  describe('Events', () => {
    let db;
    beforeEach(() => {
      db = syncedDB.open({name: 'mydb', version: 1, stores});
    });
    it('emits add event when creating record', done => {
      db.roads.on('add', e => {
        done();
      });
      db.roads.put({length: 100, price: 1337});
    });
    it('emits update event when modifying record', done => {
      const spy1 = sinon.spy();
      const spy2 = sinon.spy();
      db.roads.on('add', spy1);
      db.roads.on('update', spy2);
      const road = {length: 100, price: 1337};
      db.roads.put(road)
      .then(() => db.roads.put(road)).then(() => {
        assert(spy1.calledOnce);
        assert(spy2.calledOnce);
        done();
      });
    });
    it('emits event when creating object inside transactions', done => {
      db.write('roads', roads => {
        roads.put({length: 100, price: 1337});
      });
      db.roads.on('add', addedId => {
        done();
      });
    });
    it('add event contains the added record', done => {
      const record = {length: 100, price: 1337};
      db.roads.on('add', e => {
        assert.equal(record.length, e.record.length);
        assert.equal(record.price, e.record.price);
        done();
      });
      db.roads.put(record);
    });
  });
  describe('Syncing', () => {
    let db, timestamp;
    const globalWebSocket = window.WebSocket;
    let ws, sendSpy;
    let onSend = () => {};
    beforeEach(() => {
      onSend = () => {};
      timestamp = 0;
      sendSpy = sinon.spy();
      window.WebSocket = (url, protocol) => {
        ws = {
          close() {},
          send() {
            sendSpy(...arguments);
            onSend(...arguments);
          }
        };
        setTimeout(() => {
          ws.onopen();
        }, 0);
        return ws;
      };
      db = syncedDB.open({name: 'mydb', version: 1, stores});
    });
    afterEach(() => {
      window.WebSocket = globalWebSocket;
    });
    it('stores meta data when creating new record', done => {
      db.roads.on('add', e => {
        assert(e.record.changedSinceSync === 1);
        done();
      });
      db.roads.put({length: 100, price: 1337});
    });
    it('can\'t begin sync when already syncing', done => {
      onSend = msg => {
        const data = JSON.parse(msg);
        assert.equal(data.type, 'get-changes');
        assert.deepEqual(data.storeName, 'roads');
        ws.onmessage({data: JSON.stringify({
          type: 'sending-changes',
          nrOfRecordsToSync: 0
        })});
      };
      db.sync(['roads']).then(() => {
        done();
      });
      db.sync(['roads']).catch(err => {
        assert.equal(err.type, 'AlreadySyncing');
      });
    });
    it('finds newly added records', done => {
      db.roads.put({length: 100, price: 1337})
      .then(() => db.roads.changedSinceSync.get(1)).then(changedRoads => {
        assert(changedRoads.length === 1);
        done();
      });
    });
    describe('to server', () => {
      it('sends added record', done => {
        const road = {length: 100, price: 1337};
        onSend = msg => {
          const sent = JSON.parse(msg);
          ws.onmessage({data: JSON.stringify({
            type: 'ok',
            storeName: 'roads',
            key: sent.key,
            timestamp: timestamp++,
            newVersion: 0,
          })});
        };
        db.roads.put(road)
        .then(roadId => db.pushToRemote()).then(() => {
          const sent = JSON.parse(sendSpy.getCall(0).args[0]);
          assert.deepEqual(sent.record, {
            length: 100, price: 1337
          });
          done();
        });
      });
      it('only sends records from specified store', done => {
        const road = {length: 100, price: 1337};
        const house = {street: 'Somewhere Street 1'};
        onSend = msg => {
          const sent = JSON.parse(msg);
          ws.onmessage({data: JSON.stringify({
            type: 'ok',
            storeName: sent.storeName,
            key: sent.key,
            timestamp: timestamp++,
            newVersion: 0,
          })});
        };
        db.roads.put(road)
        .then(() => db.houses.put(house)).then(roadId => db.pushToRemote('roads'))
        .then(() => {
          const sent = JSON.parse(sendSpy.getCall(0).args[0]);
          assert.deepEqual(sent.record, {
            length: 100, price: 1337
          });
          assert.equal(sendSpy.callCount, 1);
          done();
        });
      });
      it('synchronized records are marked as unchanged', done => {
        const road = {length: 100, price: 1337};
        onSend = msg => {
          const sent = JSON.parse(msg);
          ws.onmessage({data: JSON.stringify({
            type: 'ok',
            storeName: 'roads',
            key: sent.key,
            timestamp: timestamp++,
            newVersion: 0,
          })});
        };
        db.roads.put(road)
        .then(roadId => {
          assert(road.changedSinceSync === 1);
          return db.pushToRemote();
        })
        .then(() => db.roads.get(road.key)).then(road => {
          assert(road.changedSinceSync === 0);
          done();
        });
      });
      it('emits event when records are synced', done => {
        const road = {length: 100, price: 1337};
        const spy = sinon.spy();
        onSend = msg => {
          const sent = JSON.parse(msg);
          assert(spy.notCalled);
          ws.onmessage({data: JSON.stringify({
            type: 'ok',
            storeName: 'roads',
            key: sent.key,
            timestamp: timestamp++,
            newVersion: 0,
          })});
        };
        db.roads.on('synced', spy);
        db.roads.put(road).then(roadId => db.pushToRemote()).then(() => {
          assert(spy.calledOnce);
          assert.equal(spy.firstCall.args[1].price, 1337);
          done();
        });
      });
      it('sends updated records', done => {
        const road = {length: 100, price: 1337};
        onSend = raw => {
          const msg = JSON.parse(raw);
          ws.onmessage({data: JSON.stringify({
            type: 'ok',
            storeName: 'roads',
            key: msg.key || msg.record.key,
            timestamp: timestamp++,
            newVersion: (msg.version + 1) || 0,
          })});
        };
        db.roads.put(road)
        .then(key => db.pushToRemote()).then(() => {
          road.length = 110;
          return db.roads.put(road);
        }).then(() => db.pushToRemote()).then(() => {
          const secondSend = JSON.parse(sendSpy.getCall(1).args[0]);
          assert.equal(secondSend.type, 'update');
          assert.equal(secondSend.diff.m[2], 110);
          done();
        });
      });
      it('sends deleted records', done => {
        const road = {length: 100, price: 1337};
        onSend = raw => {
          const msg = JSON.parse(raw);
          ws.onmessage({data: JSON.stringify({
            type: 'ok',
            storeName: 'roads',
            key: msg.key || msg.record.key,
            timestamp: timestamp++,
            newVersion: (msg.version + 1) || 0,
          })});
        };
        db.roads.put(road)
        .then(key => db.pushToRemote()).then(() => {
          road.length = 110;
          return db.roads.delete(road);
        }).then(() => db.pushToRemote()).then(() => {
          const secondSend = JSON.parse(sendSpy.getCall(1).args[0]);
          assert.equal(secondSend.type, 'delete');
          done();
        });
      });
      it('doesn\'t find synced and deleted records', done => {
        const road = {length: 100, price: 1337};
        onSend = raw => {
          const msg = JSON.parse(raw);
          ws.onmessage({data: JSON.stringify({
            type: 'ok',
            storeName: 'roads',
            key: msg.key || msg.record.key,
            timestamp: timestamp++,
            newVersion: (msg.version + 1) || 0,
          })});
        };
        db.roads.put(road).then(key => db.pushToRemote()).then(() => db.roads.delete(road)).then(r => db.roads.get(road.key)).catch(el => db.pushToRemote()).then(r => {
          done();
        });
      });
      it('handles new key from remote', done => {
        let firstKey, newKey, road = {length: 100, price: 1337};
        onSend = msg => {
          const sent = JSON.parse(msg);
          ws.onmessage({data: JSON.stringify({
            type: 'ok',
            storeName: 'roads',
            key: sent.key,
            newKey: 1,
            timestamp: timestamp++,
            newVersion: 0,
          })});
        };
        db.roads.on('synced', (key, record) => {
          assert.equal(key, firstKey);
          assert.notEqual(key, record.key);
          newKey = record.key;
        });
        db.roads.put(road).then(roadKey => {
          firstKey = roadKey;
          return db.pushToRemote();
        }).then(() => db.roads.get(newKey)).then(road => {
          assert.equal(road.length, 100);
          done();
        });
      });
      it('updates syncedTo on `ok` message', done => {
        let secondMsg, road = {length: 100, price: 1337};
        onSend = msg => {
          const sent = JSON.parse(msg);
          if (sent.type === 'create') {
            ws.onmessage({data: JSON.stringify({
              type: 'ok',
              storeName: 'roads',
              key: sent.key,
              timestamp: 8,
              newVersion: 0,
            })});
          } else {
            secondMsg = sent;
            ws.onmessage({data: JSON.stringify({
              type: 'sending-changes',
              nrOfRecordsToSync: 0
            })});
          }
        };
        db.roads.put(road).then(roadId => db.pushToRemote()).then(() => db.pullFromRemote('roads')).then(() => {
          assert.equal(secondMsg.since, 8);
          done();
        });
      });
      it('can send custom messages to the remote', done => {
        onSend = msg => {
          const sent = JSON.parse(msg);
          assert.deepEqual(sent, {
            type: 'customType', data: 'something'
          });
          done();
        };
        db.connect().then(() => {
          db.send({type: 'customType', data: 'something'});
        });
      });
      it('can receive custom messages from the remote after connect', done => {
        db.messages.on('custom-msg', msg => {
          assert.equal(msg.data, 'foobar');
          done();
        });
        db.connect().then(() => {
          ws.onmessage({data: JSON.stringify({
            type: 'custom-msg',
            data: 'foobar'
          })});
        });
      });
      it('record is not marked sync if changed before server ok', done => {
        const road = {length: 100, price: 1337};
        onSend = msg => {
          const sent = JSON.parse(msg);
          if (sent.type === 'create') {
            road.length = 110;
            db.roads.put(road).then(() => {
              ws.onmessage({data: JSON.stringify({
                type: 'ok',
                storeName: 'roads',
                key: sent.key,
                timestamp: timestamp++,
                newVersion: 0,
              })});
            });
          } else if (sent.type === 'update') {
            ws.onmessage({data: JSON.stringify({
              type: 'ok',
              storeName: 'roads',
              key: sent.key,
              timestamp: timestamp++,
              newVersion: 0,
            })});
          }
        };
        db.roads.put(road).then(roadId => db.pushToRemote()).then(() => db.pushToRemote()).then(() => {
          assert.equal(sendSpy.callCount, 2);
          const sent1 = JSON.parse(sendSpy.getCall(0).args[0]);
          const sent2 = JSON.parse(sendSpy.getCall(1).args[0]);
          assert.equal(sent1.type, 'create');
          assert.equal(sent1.record.length, 100);
          assert.equal(sent2.type, 'update');
          assert.deepEqual(sent2.diff, {m: {2: 110}});
          done();
        });
      });
    });
    describe('from server', () => {
      it('finishes sync if nr of records to sync is zero', done => {
        onSend = msg => {
          const data = JSON.parse(msg);
          assert.equal(data.type, 'get-changes');
          assert.deepEqual(data.storeName, 'roads');
          ws.onmessage({data: JSON.stringify({
            type: 'sending-changes',
            nrOfRecordsToSync: 0
          })});
        };
        db.sync(['roads']).then(() => {
          done();
        });
      });
      it('handles created documents', done => {
        onSend = msg => {
          const data = JSON.parse(msg);
          assert.equal(data.type, 'get-changes');
          assert.deepEqual(data.storeName, 'roads');
          ws.onmessage({data: JSON.stringify({
            type: 'sending-changes',
            nrOfRecordsToSync: 1
          })});
          ws.onmessage({data: JSON.stringify({
            type: 'create',
            storeName: 'roads',
            timestamp: 1,
            version: 0,
            key: 'foo',
            record: {length: 133, price: 1000},
          })});
        };
        db.pullFromRemote('roads').then(() => db.roads.byLength.get(133)).then(roads => {
          assert.equal(roads[0].price, 1000);
          assert.equal(roads[0].version, 0);
          done();
        });
      });
      it('saves original remote version', done => {
        let road;
        onSend = msg => {
          const data = JSON.parse(msg);
          assert.equal(data.type, 'get-changes');
          assert.deepEqual(data.storeName, 'roads');
          ws.onmessage({data: JSON.stringify({
            type: 'sending-changes',
            nrOfRecordsToSync: 1
          })});
          ws.onmessage({data: JSON.stringify({
            type: 'create',
            storeName: 'roads',
            timestamp: 1,
            key: 'foo',
            record: {version: 0, length: 133, price: 1000}
          })});
        };
        db.pullFromRemote('roads')
        .then(() => db.roads.byLength.get(133)).then(roads => {
          road = roads[0];
          road.price = 1300;
          return db.roads.put(road);
        }).then(() => {
          assert.equal(road.price, 1300);
          assert.equal(road.remoteOriginal.price, 1000);
          done();
        });
      });
      it('handles updated documents', done => {
        let roadKey;
        const road = {length: 100, price: 1337};
        onSend = raw => {
          const msg = JSON.parse(raw);
          if (msg.type === 'create') {
            ws.onmessage({data: JSON.stringify({
              type: 'ok',
              storeName: 'roads',
              key: msg.key,
              timestamp: timestamp++,
              newVersion: 0,
            })});
          } else {
            ws.onmessage({data: JSON.stringify({
              type: 'sending-changes',
              nrOfRecordsToSync: 1
            })});
            ws.onmessage({data: JSON.stringify({
              type: 'update',
              storeName: 'roads',
              key: road.key,
              timestamp: 1,
              version: 1,
              diff: {m: {2: 110}},
            })});
          }
        };
        db.roads.put(road).then(() => {
          roadKey = road.key;
          return db.pushToRemote();
        }).then(() => db.pullFromRemote('roads')).then(() => db.roads.get(roadKey)).then(road => {
          assert.equal(road.version, 1);
          assert.equal(road.changedSinceSync, 0);
          assert.equal(road.length, 110);
          done();
        });
      });
      it('handles deleted documents', done => {
        const road = {length: 100, price: 1337};
        let roadKey;
        onSend = raw => {
          const msg = JSON.parse(raw);
          if (msg.type === 'create') {
            ws.onmessage({data: JSON.stringify({
              type: 'ok',
              storeName: 'roads',
              key: msg.key,
              timestamp: timestamp++,
              newVersion: 0,
            })});
          } else {
            ws.onmessage({data: JSON.stringify({
              type: 'sending-changes',
              nrOfRecordsToSync: 1
            })});
            ws.onmessage({data: JSON.stringify({
              type: 'delete',
              storeName: 'roads',
              key: roadKey,
              timestamp: 1,
              version: 1,
            })});
          }
        };
        db.roads.put(road).then(key => {
          roadKey = road.key;
          return db.pushToRemote('roads');
        }).then(() => db.pullFromRemote('roads')).then(() => db.roads.get(roadKey)).catch(err => {
          assert.equal(err.type, 'KeyNotFoundError');
          done();
        });
      });
      it('emits conflict on update to changed record', done => {
        const road = {length: 100, price: 1337};
        const stub = sinon.stub().returnsArg(1);
        db.stores.roads.handleConflict = stub;
        onSend = raw => {
          const msg = JSON.parse(raw);
          if (msg.type === 'create') {
            ws.onmessage({data: JSON.stringify({
              type: 'ok',
              storeName: 'roads',
              key: msg.key,
              timestamp: timestamp++,
              newVersion: 0,
            })});
          } else if (msg.type === 'update') {
            ws.onmessage({data: JSON.stringify({
              type: 'ok',
              storeName: 'roads',
              timestamp: timestamp++,
              key: msg.key,
            })});
          } else {
            ws.onmessage({data: JSON.stringify({
              type: 'sending-changes',
              nrOfRecordsToSync: 1
            })});
            ws.onmessage({data: JSON.stringify({
              type: 'update',
              storeName: 'roads',
              key: road.key,
              timestamp: 1,
              version: 1,
              diff: {m: {2: 110}},
            })});
          }
        };
        db.roads.put(road).then(() => db.pushToRemote()).then(() => {
          road.price = 2000;
          return db.roads.put(road);
        }).then(() => db.pullFromRemote('roads')).then(() => {
          assert(stub.calledOnce);
          const original = stub.getCall(0).args[0];
          assert.equal(original.length, 100);
          assert.equal(original.price, 1337);
          const local = stub.getCall(0).args[1];
          assert.equal(local.length, 100);
          assert.equal(local.price, 2000);
          const remote = stub.getCall(0).args[2];
          assert.equal(remote.length, 110);
          assert.equal(remote.price, 1337);
          done();
        });
      });
      it('emits conflict on update to locally deleted record', done => {
        const road = {length: 100, price: 1337};
        const stub = sinon.stub().returnsArg(1);
        db.stores.roads.handleConflict = stub;
        onSend = raw => {
          const msg = JSON.parse(raw);
          if (msg.type === 'create') {
            ws.onmessage({data: JSON.stringify({
              type: 'ok',
              storeName: 'roads',
              key: msg.key,
              timestamp: timestamp++,
              newVersion: 0,
            })});
          } else {
            ws.onmessage({data: JSON.stringify({
              type: 'sending-changes',
              nrOfRecordsToSync: 1
            })});
            ws.onmessage({data: JSON.stringify({
              type: 'update',
              storeName: 'roads',
              key: road.key,
              timestamp: 1,
              version: 1,
              diff: {m: {2: 110}},
            })});
          }
        };
        db.roads.put(road)
        .then(() => db.pushToRemote()).then(() => db.roads.delete(road)).then(() => db.pullFromRemote('roads')).then(() => {
          assert(stub.calledOnce);
          const original = stub.getCall(0).args[0];
          assert.equal(original.length, 100);
          assert.equal(original.price, 1337);
          const local = stub.getCall(0).args[1];
          assert.equal(local.deleted, true);
          const remote = stub.getCall(0).args[2];
          assert.equal(remote.length, 110);
          assert.equal(remote.price, 1337);
          done();
        });
      });
      it('emits conflict on remote delete to locally modified record', done => {
        const road = {length: 100, price: 1337};
        const stub = sinon.stub().returnsArg(1);
        db.stores.roads.handleConflict = stub;
        onSend = raw => {
          const msg = JSON.parse(raw);
          if (msg.type === 'create') {
            ws.onmessage({data: JSON.stringify({
              type: 'ok',
              storeName: 'roads',
              key: msg.key,
              timestamp: timestamp++,
              newVersion: 0,
            })});
          } else {
            ws.onmessage({data: JSON.stringify({
              type: 'sending-changes',
              nrOfRecordsToSync: 1
            })});
            ws.onmessage({data: JSON.stringify({
              type: 'delete',
              storeName: 'roads',
              key: road.key,
              timestamp: 1,
              version: 1,
            })});
          }
        };
        db.roads.put(road).then(() => db.pushToRemote()).then(() => {
          road.length = 110;
          return db.roads.put(road);
        }).then(() => db.pullFromRemote('roads')).then(() => {
          assert(stub.calledOnce);
          const original = stub.getCall(0).args[0];
          assert.equal(original.length, 100);
          assert.equal(original.price, 1337);
          const local = stub.getCall(0).args[1];
          assert.equal(local.length, 110);
          assert.equal(local.price, 1337);
          const remote = stub.getCall(0).args[2];
          assert.equal(remote.deleted, true);
          done();
        });
      });
      it('requests changes since last sync', done => {
        onSend = msg => {
          const data = JSON.parse(msg);
          if (data.since === null) {
            ws.onmessage({data: JSON.stringify({
              type: 'sending-changes',
              nrOfRecordsToSync: 1
            })});
            ws.onmessage({data: JSON.stringify({
              type: 'create',
              storeName: 'roads',
              timestamp: 0,
              key: 'foo',
              version: 0,
              record: {length: 133, price: 1000}
            })});
          } else {
            ws.onmessage({data: JSON.stringify({
              type: 'sending-changes',
              nrOfRecordsToSync: 0
            })});
          }
        };
        db.pullFromRemote('roads').then(() => db.pullFromRemote('roads')).then(road => {
          assert(sendSpy.calledTwice);
          done();
        });
      });
      it('emits events for created documents', done => {
        let key;
        onSend = msg => {
          const data = JSON.parse(msg);
          assert(data.type === 'get-changes');
          ws.onmessage({data: JSON.stringify({
            type: 'sending-changes',
            nrOfRecordsToSync: 1
          })});
          ws.onmessage({data: JSON.stringify({
            type: 'create',
            storeName: 'roads',
            timestamp: 1,
            key: 'foo',
            version: 0,
            record: {length: 133, price: 1000}
          })});
        };
        db.roads.on('add', e => {
          key = e.record.key;
        });
        db.pullFromRemote('roads').then(() => {
          assert.equal(key, 'foo');
          done();
        });
      });
      it('emits event when custom message is recieved', done => {
        db.messages.on('myMsgType', msg => {
          assert.deepEqual(msg, {type: 'myMsgType', data: 'stuff'});
          done();
        });
        onSend = msg => {
          const data = JSON.parse(msg);
          assert(data.type === 'get-changes');
          ws.onmessage({data: JSON.stringify({
            type: 'myMsgType',
            data: 'stuff',
          })});
        };
        db.pullFromRemote('animals');
      });
      it('emits event on store when custom message with store name is recieved', done => {
        db.animals.messages.on('myMsgType', msg => {
          assert.deepEqual(msg, {
            type: 'myMsgType',
            storeName: 'animals',
            data: 'stuff'
          });
          done();
        });
        onSend = msg => {
          const data = JSON.parse(msg);
          assert(data.type === 'get-changes');
          ws.onmessage({data: JSON.stringify({
            type: 'myMsgType',
            storeName: 'animals',
            data: 'stuff',
          })});
        };
        db.pullFromRemote('animals');
      });
      it('emits event when sync is started', done => {
        const spy = sinon.spy();
        onSend = msg => {
          const data = JSON.parse(msg);
          assert(data.type === 'get-changes');
          ws.onmessage({data: JSON.stringify({
            type: 'sending-changes',
            nrOfRecordsToSync: 1
          })});
          ws.onmessage({data: JSON.stringify({
            type: 'create',
            storeName: 'roads',
            timestamp: 1,
            key: 'foo',
            version: 0,
            record: {length: 133, price: 1000}
          })});
        };
        db.on('sync-initiated', spy);
        db.pullFromRemote('roads').then(() => {
          assert(spy.calledOnce);
          assert.equal(spy.firstCall.args[0].nrOfRecordsToSync, 1);
          done();
        });
      });
      it('calls handle on reject message and skips record', done => {
        const road = {length: 100, price: 1337};
        const spy = sinon.stub().returns(false);
        db.roads.handleReject = spy;
        onSend = msg => {
          const data = JSON.parse(msg);
          assert(data.type === 'create');
          if (data.record.length === 100) {
            ws.onmessage({data: JSON.stringify({
              type: 'reject',
              storeName: data.storeName,
              key: data.key,
            })});
          } else {
            ws.onmessage({data: JSON.stringify({
              type: 'ok', storeName: 'roads', key: data.key, newVersion: 0, timestamp: timestamp++,
            })});
          }
        };
        db.roads.put(road).then(() => db.pushToRemote('roads')).then(() => {
          road.length = 110;
          return db.roads.put(road);
        }).then(() => db.pushToRemote('roads')).then(() => {
          assert(spy.calledOnce);
          assert.equal(spy.getCall(0).args[0].length, 100);
          assert.equal(spy.getCall(0).args[1].storeName, 'roads');
          done();
        });
      });
      it('calls handle on reject message and resends record', done => {
        const road = {length: 100, price: 1337};
        const spy = sinon.stub().returnsArg(0);
        db.roads.handleReject = spy;
        let msgCount = 0;
        onSend = msg => {
          msgCount++;
          const data = JSON.parse(msg);
          assert(data.type === 'create');
          if (msgCount === 1) {
            ws.onmessage({data: JSON.stringify({
              type: 'reject',
              storeName: data.storeName,
              key: data.key,
            })});
          } else {
            ws.onmessage({data: JSON.stringify({
              type: 'ok', storeName: 'roads', key: data.key, newVersion: 0, timestamp: timestamp++,
            })});
          }
        };
        db.roads.put(road).then(() => db.pushToRemote('roads')).then(() => {
          assert(spy.calledOnce);
          assert.equal(spy.getCall(0).args[0].length, 100);
          assert.equal(spy.getCall(0).args[1].storeName, 'roads');
          done();
        });
      });
    });
    describe('continuous sync', () => {
      it('sends added records when syncing', done => {
        onSend = msg => {
          const data = JSON.parse(msg);
          if (data.type === 'get-changes') {
            ws.onmessage({data: JSON.stringify({
              type: 'sending-changes',
              nrOfRecordsToSync: 0
            })});
          } else {
            ws.onmessage({data: JSON.stringify({
              type: 'ok',
              storeName: 'animals',
              timestamp: timestamp++,
              key: data.key,
            })});
          }
        };
        db.sync(['animals'], {continuously: true}).then(() => {
          db.animals.put({color: 'grey', name: 'Mister'}).then(() => {
            const secondSend = JSON.parse(sendSpy.getCall(1).args[0]);
            assert.equal(secondSend.type, 'create');
            assert.equal(secondSend.record.color, 'grey');
            done();
          });
        });
      });
      it('sends updated records when syncing', done => {
        onSend = data => {
          const msg = JSON.parse(data);
          if (msg.type === 'get-changes') {
            ws.onmessage({data: JSON.stringify({
              type: 'sending-changes',
              nrOfRecordsToSync: 0
            })});
          } else {
            ws.onmessage({data: JSON.stringify({
              type: 'ok',
              storeName: 'animals',
              key: msg.key,
              timestamp: timestamp++,
              newVersion: (msg.version + 1) || 0,
            })});
          }
        };
        db.sync(['animals'], {continuously: true}).then(() => {
          const cat = {color: 'grey', name: 'Mister'};
          db.animals.put(cat).then(() => {
            cat.color = 'white';
            return db.animals.put(cat);
          }).then(() => {
            const secondSend = JSON.parse(sendSpy.getCall(1).args[0]);
            assert.equal(secondSend.type, 'create');
            assert.deepEqual(secondSend.record, {
              color: 'grey', name: 'Mister',
            });
            const thirdSend = JSON.parse(sendSpy.getCall(2).args[0]);
            assert.equal(thirdSend.type, 'update');
            assert.equal(thirdSend.diff.m[1], 'white');
            done();
          });
        });
      });
      it('sends multiple updates continuously', done => {
        onSend = data => {
          const msg = JSON.parse(data);
          if (msg.type === 'get-changes') {
            ws.onmessage({data: JSON.stringify({
              type: 'sending-changes',
              nrOfRecordsToSync: 0
            })});
          } else {
            ws.onmessage({data: JSON.stringify({
              type: 'ok',
              storeName: 'animals',
              key: msg.key || msg.record.key,
              timestamp: timestamp++,
              newVersion: (msg.version + 1) || 0,
            })});
          }
        };
        db.sync(['animals'], {continuously: true}).then(() => {
          const cat = {color: 'grey', name: 'Mister'};
          db.animals.put(cat).then(() => {
            cat.color = 'white';
            return db.animals.put(cat);
          }).then(() => {
            cat.color = 'grey';
            return db.animals.put(cat);
          }).then(() => {
            const secondSend = JSON.parse(sendSpy.getCall(1).args[0]);
            assert.equal(secondSend.type, 'create');
            assert.equal(secondSend.record.color, 'grey');
            const thirdSend = JSON.parse(sendSpy.getCall(2).args[0]);
            assert.equal(thirdSend.type, 'update');
            assert.equal(thirdSend.diff.m[1], 'white');
            const fourthSend = JSON.parse(sendSpy.getCall(3).args[0]);
            assert.equal(fourthSend.diff.m[1], 'grey');
            done();
          });
        });
      });
    });
  });
  it('exposes diff and patch', () => {
    const rabbit1 = {name: 'Thumper', age: 1, color: 'brown'};
    const rabbit2 = {name: 'Thumper', age: 3, color: 'grey'};
    const delta = syncedDB.diff(rabbit1, rabbit2);
    syncedDB.patch(rabbit1, delta);
    assert.deepEqual(rabbit1, rabbit2);
  });
});

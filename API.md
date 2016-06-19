API documentation
-----------------

Table of contents
=================

- [Client API documentation](#client-api-documentation)
- [Server API documentation](#server-api-documentation)

Client API documentation
========================

### syncedDB.open(options)
Opens a new or existing database.

__Arguments__

* `options` (object): The options to the server. Properties:
  * `name` (string) - the name of the database to open.
  * `version` (number) - the version of the database to open.
  * `stores` (object) - An object declaring the stores in the database and their indexes.
  * \[`remote`\] (string) - An URL specifying the location of the remote to which the client should sync.
  * \[`migrations`\] (object) - An object with keys matching callbacks to execute when the database is upgraded.

__Returns__

`SDBDatabase`: The opened database.

__Example__

```javascript
var db = syncedDB.open({
  name: 'mydb',
  version: 3,
  stores: {
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
  },
  migrations: {
    2: function(IDBDatabase, event) { /* do stuff when upgraded to version 2*/ },
    3: function(IDBDatabase, event) { /* do other stuff on upgrato to version 3 */ },
  }
}).then(function(db) {
  // Db was opened successfully.
}).catch(function(err) {
  // Opening db failed.
});
```

### SDBDatabase
Provides easy access to the stores it contains and their indexes.
It provides means to opening transactions on the database.

The database is also a thenable that is resolved when the database has been successfully
openend and rejected if the opening fails.

SDBDatabase is an event emitter.

__Properties__

* `name` - the name of the database
* `db` - the raw IDBDatabase associated with the database
* `version` - the version of the database
* `remote` - the address to which the database should sync
* `stores` - an object of the SDBIndexes belonging to the store
* `messages` - an event emitter which emits custom events from the server

Furthermore the databases stores is directly attached to the database object as long
as they don't collide with any existing properties.

__Events__

| Name             | Description |
| ---------------- | ----------- |
| `sync-initiated` |             |

### SDBDatabase#transaction
Opens a transaction on the database in either readonly or readwrite mode and
including the specified list of stores.

The callback is passed a number of SDBStores matching the parameter `storeNames`.

__Arguments__

* `storeNames` (array): Strings naming the stores the transaction should contain.
* `mode` (string): The mode of the transaction.
* `callback` (function): Will be called inside the transaction.

__Returns__

A promise that is resolved when the transaction finishes successfully and rejects if an
error happens inside the transaction.

__Example__

```
db.transaction(['orders', 'employees'], 'read', function(orders, employees) {
  // Do stuff in transaction.
}).then(function() {
  // Transaction finished successfully.
});
```

### SDBDatabase#read
Opens a readonly transaction on the database and including the specified list
of stores.

The callback is passed a number of SDBStores matching the arguments.

__Arguments__

* `storeName` (...string): The stores the transaction should contain.
* `callback` (function): Will be called inside the transaction.

__Returns__

A promise that is resolved when the transaction finishes successfully and rejects if an
error happens inside the transaction.

__Example__

```
db.connect().then(function() {
  db.
});
```

### SDBDatabase#write
Opens a readwrite transaction on the database and including the specified list
of stores.

The callback is passed a number of SDBStores matching the arguments.

__Arguments__

* `storeName` (...string): The stores the transaction should contain.
* `callback` (function): Will be called inside the transaction.

__Returns__

A promise that is resolved when the transaction finishes successfully and rejects if an
error happens inside the transaction.

__Example__

```
db.connect().then(function() {
  db.
});
```

### SDBDatabase#sync()
Synchronize the local database with the remote. This fetches and applies all changes from the remote
since the last synchronization. Afterwards it sends all local changes to the remote.

__Arguments__
  * \[`storeNames`\] (string|array) - The store or stores that should be synced to the remote.
  * \[`options`\] (object) - Options regarding how the sync is performed
    * `continuously` (boolean) - Whether or not the synchronization should continue after all changes
      at the time of calling `sync` has been synchronized.

__Returns__

A promise that is resolved when all changes at the time of calling `sync` has
been synchronized.

__Example__

```javascript
db.sync('books').then(function() {
  // The local books store is now up to date with the server.
});
```

### SDBDatabase#connect()
Open a WebSocket connection to the server. This is useful if you wish to send custom messages
to the server using `SDBDatabase#send`.

__Arguments__

None.

__Returns__

A promise that is resolved when the connection has been established and rejects if an
error happens while trying to connect.

__Example__

```
db.connect().then(function() {
  // Connection is established.
});
```

### SDBDatabase#disconnect()
Closes a WebSocket connection to the server.

__Arguments__

None.

__Returns__

Nothing

__Example__

```
db.connect().then(function() {
  // We are connected.
  db.disconnect();
  // Now disconnected.
});
```

### SDBStore
Gives easy access to querying the records it contains, both with primary keys and
through indexes.

__Properties__

* `name`(string) - the name of the store
* `db`(SDBDatabase) - the database the store belongs to
* `indexes` - an object of the indexes in the store

Furthermore the stores indexes is directly attached to the store object as long
as they don't collide with any existing properties.

__Events__

Name     | Description
-------- | --------------------
`create` | A record has been created. Event handler is passed a change event
`update` | A record has been updated. Event handler is passed a change event
`delete` | A record has been deleted. Event handler is passed a change event
`synced` | A record has been synced to the remote. Event handler is passed the key of the record and the record |

### SDBStore#get
Get a record from a store by key. If the store is accessed outside of a transaction
a transaction will implicitly be acquired.

__Arguments__

* `key` (...string|number) - a primary key of a record

__Returns__

A promise resolved with a single record in case only a single key was passed or with
an array of records if several keys was passed. The promise rejects if the key cannot
be found.

__Example__

```javascript
db.products.get(36).then(function(product) {
  // Do something with the product with the primary key 36.
}).reject(function(err) {
  if (err.type === 'KeyNotFoundError') {
    // No record exists with the key 36.
  }
});

db.products.get(fooId, barId).then(function(foo, bar) {
  // Do something with the product having the primary key 36.
});
```

### SDBStore#put
Add or insert one or more records into a store. If the store is accessed
outside of a transaction a transaction will implicitly be acquired.

__Arguments__

* `record` (...object) - a record as an object

__Returns__

A promise resolved with an array of the keys of the passed records.

__Example__

```javascript
var rabbit = {
  type: 'rabbit',
  name: 'Thumper',
  color: 'grey'
};
db.animals.put(rabbit).then(function(key) {
  // Record has been created
  assert.equal(rabbit.key, key);
});
```

### SDBStore#delete
Delete a record from a store by key or by a record with. If the store is
accessed outside of a transaction a transaction will implicitly be acquired.

__Arguments__

* `key` (...string|number|object) - a primary key of a record or an object with a key property

__Returns__

A promise resolved when all records has been successfully deleted.

__Example__

```javascript
db.employees.delete(12).then(function() {
  // Employee with key 12 deleted
});

var newAnimal = {type: 'dog', age: 17, name: 'Sally'};
db.animals.put(newAnimal).then(function(newKey) {
  // Animal has been created
  return db.animals.delete(newKey);
}).then(function() {
  // Animal has been deleted again
});
```

### SDBIndex

An object representing an index in an object store. It gives access to querying
the records in the story by the specific index.

__Properties__

* `name`(SDBDatabase) - name of the index
* `db`(SDBDatabase) - database the index belongs to
* `store`(SDBStore) - store the index belongs to

### SDBIndex#get
Get a record from a store by the value of a key path. If the index is accessed
outside of a transaction a transaction will implicitly be acquired.

__Arguments__

* `value` (...string|number|boolean|object|array) - value to match against the
  value at the records key path

__Returns__

A promise resolved with an array of all records that matched one of the
values queried for. If no matching records was found an empty array will
be returned.

__Example__

```javascript
db.products.byLocation.get('south', 'north').then(function(products) {
  // A producs whose location is either 'south' or 'north'
});
```

### SDBIndex#getAll()
Get all records in the store orderded by the key path of the index.

__Arguments__
None.

__Returns__
And array of all records in the store.

__Example__
```javascript
db.products.byValue.getAll().then(function(records) {
  // All records sorted with the lowest value first
});
```

### SDBIndex#inRange

__Arguments__
* `range` (...object) - a range to query for

__Returns__
A promise resolved with an array of all records that are contained in one
of the ranges queried for. If no matching records was found an empty array will
be returned.

__Example__
```javascript
db.product.byValue.inRange({gt: 100, lte: 200}).then(function(products) {
  // All products where value is in the interval ]100;200]
});

db.product.byValue.inRange({lte: 100}).then(function(products) {
  // All products where value is <= 100
});
```

### Database declarations

IndexedDB provides a very imperiative way of handle database upgrades. Through
migration callbacks SyncedDB makes imperiative upgrades possible as well,
albeit with a more convenient form.

But almost all types of database upgrades can be declaratively handled with SyncedDBs
store declaration format. The declaration consists of an object where each property
name corresponds to a store and where the values are arrays describing the indexes
the store should contain.

Whenever the database is upgraded SyncedDB makes shure that all the stores and
indexes exists and creates them if they don't.

__Example__
```
stores = {
  employees: { // One store named 'employees'
    ['byFirstName', 'firstName'], // One index named 'byFirstname' with the key path 'firstName'
    ['byLastName', 'lastName'],
    ['byEmail', 'email', {unique: true}] // An index with the unique options set to true
  },
  products: { // One store named 'products'
    ['byName', name, {unique: true}],
    ['byEmployee', 'responsibleEmployees', {multiEntry: true}] // An index with the multi entry option set
  },
};
```

### Events

SDBDatabses and SDBStores are event emitters. These objects can publish events and you
can register event listeners to them.

Server API documentation
========================

### Server

Represents a SyncedDB server. The server makes a Web Socket server available, and handles
messages from clients, delegating storage to a persistence strategy that must be supplied
at construction.

__Properties__

* `handlers` (object) - a mapper from message types to handler functions.
  the handler is called like this: `handler(clientData, store, msg, sendFn, broadcastFn, opt_upgradeReq)`.
  `opt_upgradeReq` is passed only when `server` is specified to the constructor.

### Server.defaultHandlers

The default handlers for the inbuilt message types. If you want to extend the default
message handlers (for instance with validation) you can overwrite a servers handler and
delegate off to a default handler.

__Example__

```javascript
server.handle.create(function(clientData, store, msg, respond, broadcast) {
  var errorMsg = validateCreateMsg(msg);
  if (errorMsg) {
    respond(errorMsg);
  } else {
    Server.defaultHandlers.create.apply(null, arguments);
  }
});
```

### new Server(options)

__Arguments__
* `options` (object) - options object with the following properties
  * `server` (HTTP server) - the HTTP server created with http.createServer(), otherwise it will create it
  * `port` (integer) - the port that the Web Socket server should listen at
  * `store` (object) - an instance of a persistence strategy

__Returns__
A new server.

__Example__

```javascript
MemoryPersistence.create().then(function(persistence) {
  var server = new Server({
    port: 3001,
    persistence: persistence
  });
});
```

### Server#resetHandlers()

Reset all the servers message handlers to their default.

__Arguments__

None.

__Returns__

Nothing.

__Example__

```javascript
server.resetHandlers();
assert.deepEqual(server.handlers, Server.defaultHandlers);
```

### Server#close()

Closes the Web Socket server.

__Arguments__

None.

__Returns__

Nothing.

__Example__

```javascript
server.close();
```

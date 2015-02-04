SyncedDB
========
SyncedDB makes it easy to write __offline-first__ applications with
__real-time__ syncing and server-side __persistence__.

SyncedDB makes web applications work beautifully both online and offline.

Write your client as if everything was stored offline! SyncedDB takes care of
synchronizing the local database to the server and between clients.

Why
---
Since the widestream adoption of IndexedDB writing web applications
with full offline support has been viable. But when storing data offline web
applications looses the feature of seamlessly making a users data available
across devices. SyncedDB is a library that gives web applications the best of
both worlds: a fully functional offline experience with real-time or on demand
synchronization of data when online.

What
----
SyncedDB was built with the following design goal: Be as simple as possible while
still providing all the features and flexibility necessary to easily create
efficient and secure real-time synchronizing web applications that works offline.

SyncedDB is a lightweight layer on top of IndexedDB. It strips away all the
boilerplate that the IndexedDB API requires by introducing implicit transactions,
convenience methods and promises for all asynchronous operations.

Server side SyncedDB stores a list of changes that clients can request/subscribe
and post/publish to. The SyncedDB client communicates with the backend through
WebSockets to achieve synchronization in real time. Furthermore the client provides
elegant conflict handling and events for reacting to changes published from the 
server.

How is it different
-------------------
Some libraries caters to multiple storage backends and thus ends up with a
limited feature set to support the lowest common denomenator. Other implements
a new database on top of the browsers native storage facilities. This highly
increases complexity and reduces performance. By being a small wrapper around
IndexedDB SyncedDB gains some of its key features: simplicity, power and
performance.

The SyncedDB backend was designed to be as flexible as possible. Users can
easily plug in any database they want, create custom message handlers at
relevant points and extend the communication between the client and the server
with custom messages.

State
-----
SyncedDB is still under development. Expect rough edges.

Main features
--------
* No additional abstractions on top of IndexedDB. It exposes the same
  raw power and performane but through a significantly more convenient API
* Compact declarative store and index definitions with automatic upgrades
* Uses promises for all async operations — even inside IndexedDB transactions
* Synchronizes data through WebSockets and sends only compact diffs down the
  wire. This makes the network usage light and efficient.
* Makes it easy and intuitive to handle conflicts.
* Simple and highly flexible backend. Bring your own server-side validations,
  authentication, authorization, etc. Plug in any database you like and store data
  any way you want alongside the format that SyncedDB uses internally.

Major missing features
----------------
* API for IndexedDB cursors
* More persistence options – currently only PostreSQL and in memory (for developing)
  is supported. These are easy to write though! Check out the existing ones, start
  from there and make sure they passes the persistence test suite.

Example
-------

__Client__

```javascript
var stores = {
  tasks: [ // One store named 'tasks'
    ['byCreation', 'createdAt'] // With one index into the 'createdAt' property
  ]
};

var db = syncedDB.open({ // Open database
  name: 'todoApp',
  version: 1,
  stores: stores,
  remote: 'localhost:8080',
});

db.tasks.put({ // Add one task to database
  description: 'Task description',
  finished: false,
  createdAt: Date.now()
});

db.tasks.byCreation.getAll() // Get all task elements sorted after creation
.then(function(tasks) {
  tasks.forEach(createTaskElm);
});

db.tasks.on('add', function(e) { // A new task element pushed from remote
  createTaskElm(e.record); // Handle task
});

// Start syncing continously, the server will now
// push and pull changes in real time
db.syncContinuously('tasks');
```

__Server__

```
var Server = require('synceddb-server');

// Persistence with PostreSQL
var pgPersistence = require('synceddb-persistence-postgres');

var server = new Server({
  port: 8080,
  store: new pgPersistence({
    conString: 'postgres://postgres@localhost/synceddb',
  }),
});
```

[See the entire example including server code here]
(https://github.com/paldepind/synceddb/tree/master/examples/todo)

Try it
------
Get the repository
```
git clone https://github.com/paldepind/synceddb.git
cd synceddb/examples/todo
```
Get dependencies
```
npm install
```
Start server
```
node server.js
```
Open the todo app example in a few different browsers
```
firefox index.html
google-chrome index.html
```
Try adding, toggling and deleting todo items. You will see
that changes are synchronized instantly between the
connected clients.

The example server uses in memory storage. Thus if you restart it
make sure to wipe client side data as well by running
`indexedDB.deleteDatabase('todoApp');` in the browsers console.

API documentation
-----------------
Beware, the documentation is in early stages.

Client API documentation
========================

### syncedDB.open(options)
Opens a new or existing database.

__Arguments__

* `options` (object): The options object is an object with the following properties
  * `name` (string) - the name of the database to open.
  * `version` (number) - the version of the database to open.
  * `stores` (object) - An object declaring the stores in the database and their indexes.
  * [`remote`] (string) - An URL specifying the location of the remote to which the client should sync.
  * [`migrations`] (object) - An object with keys matching callbacks to execute when the database is upgraded.

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
  // db was opened successfully
}).catch(function(err) {
  // opening db failed
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

| Name             | Description
| `sync-initiated` |  |

### SDBDatabase#transaction
Opens a transaction on the database in either readonly or readwrite mode and
including the specified list of stores.

The callback is passed a number of SDBStores matching the parameter `storeNames`.

__Arguments__

* `storeNames` (array): An array of strings naming the stores the transaction should contain.
* `mode` (string): A string describing the mode of the transaciton.
* `callback` (function): A function that should be carried out inside the transaction.

__Returns__

A promise that is resolved when the transaction finishes successfully and rejects if an
error happens inside the transaction.

__Example__

```
db.transaction(['orders', 'employees'], 'read', function(orders, employees) {
  // do stuff in transaction
}).then(function() {
  // transaction finished successfully
});
```

### SDBDatabase#read
Opens a readonly transaction on the database and including the specified list
of stores.

The callback is passed a number of SDBStores matching the arguments.

__Arguments__

* `storeName` (...string): A string naming a the transaction should contain.
* `callback` (function): A function that should be carried out inside the transaction.

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

* `storeName` (...string): A string naming a the transaction should contain.
* `callback` (function): A function that should be carried out inside the transaction.

__Returns__

A promise that is resolved when the transaction finishes successfully and rejects if an
error happens inside the transaction.

__Example__

```
db.connect().then(function() {
  db.
});
```

### SDBDatabase#connect
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
  // connection is established
});
```

### SDBDatabase#disconnect
Closes a WebSocket connection to the server.

__Arguments__

None.

__Returns__

Nothing

__Example__

```
db.connect().then(function() {
  // we are connected
  db.disconnect();
  // now disconnected
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
  // do something with the product with the primary key 36
}).reject(function(err) {
  if (err.type === 'KeyNotFoundError') {
    // no record exists with the key 36
  }
});

db.products.get(fooId, barId).then(function(foo, bar) {
  // do something with the product having the primary key 36
});
```

### SDBStore#put
Add or insert one or more records into a store. If the store is accessed
outside of a transaction a transaction will implicitly be acquired.

__Arguments__

* `record` (...object) - a record as an object

__Returns__

A promise resolved with a single key in case only a single record was passed or
with an array of keys if several records was passed.

__Example__

```javascript
var rabbit = {
  type: 'rabbit',
  name: 'Thumper',
  color: 'grey'
};
db.animals.put(rabbit).then(function(key) {
  // record has been created
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
  // employee with key 12 deleted
});

var newAnimal = {type: 'dog', age: 17, name: 'Sally'};
db.animals.put(newAnimal).then(function(newKey) {
  // animal has been created
  return db.animals.delete(newKey);
}).then(function() {
  // animal has been deleted again
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
  // a producs whose location is either 'south' or 'north'
});
```

### SDBIndex#getAll
Get all records in the store orderded by the key path of the index.

__Arguments__
None.

__Returns__
And array of all records in the store.

__Example__
```javascript
db.products.byValue.getAll().then(function(records) {
  // all records sorted with the lowest value first
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
db.product.byValue.getInRange({gt: 100, lte: 200}).then(function(products) {
  // all products where value is in the interval ]100;200]
});

db.product.byValue.getInRange({lte: 100}).then(function(products) {
  // all products where value is <= 100
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
  employees: { // one store named 'employees'
    ['byFirstName', 'firstName'], // one index named 'byFirstname' with the key path 'firstName'
    ['byLastName', 'lastName'],
    ['byEmail', 'email', {unique: true}] // an index with the unique options set to true
  },
  products: { // one store named 'products'
    ['byName', name, {unique: true}],
    ['byEmployee', 'responsibleEmployees', {multiEntry: true}] // an index with the multi entry option set
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

* `handlers` (object) - a mapper from message types to handler functions, 
  the handler is called like this: `handler(clientData, store, msg, sendFn, broadcastFn)`

### new Server(options)

__Arguments__
* `options` (object) - options object with the following properties
  * `port` (integer) - the port that the Web Socket server should listen at
  * `store` (object) - an instance of a persistence strategy

__Returns__
A new server.

__Example__

```javascript
var store = new MemoryPersistence();
var server = new Server({
  port: 3001,
  persistence: new MemoryPersistence(),
});
```

### Server#resetHandlers()

__Arguments__
None.

__Returns__
Nothing.

__Example__

```javascript
server.resetHandlers();
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

### new Server(opts)

__Arguments__
* `range` (...object) - a range to query for

__Returns__

__Example__

```javascript
```


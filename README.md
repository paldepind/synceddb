SyncedDB
========
SyncedDB makes it easy to write __offline-first__ applications with
__realtime__ syncing across devices and server-side __persistence__.

In other words SyncedDB makes web applications work beautifully both online and
offline.

Why
---
Since the arrival and widestream adoption of IndexedDB writing web applications
with full offline support has been viable. But when storing data offline web
applications looses the feature of seamlessly making a users data available
across devices. SyncedDB is a library that gives web applications the best of
both worlds: a fully functional offline experience with realtime or on demand
synchronization of data when online.

When using SyncedDB web application developers can simply write the client side
code as if everything was stored offline. Then plug in a remote backend and
SyncedDB takes care of synchronizing the local database to the server and
between clients.

What makes it different
-----------------------
SyncedDB is a lightweight layer on top of IndexedDB. Some libraries caters to
multiple storage backends and thus ends up with a limited feature set to
support the lowest common denomenator (think localForage). Other implements a
new database on top of the browsers native storage facilities (like PouchDB).
This highly increases complexity and reduces performance. By being a small
wrapper around IndexedDB SyncedDB gains some of its key features: simplicity,
power and performance.

The SyncedDB backend was designed to be as flexible as possible. Users can
easily plug in any storage option they want, create custom message handlers at
relevant points and extend the communication between the client and the server
with custom messages.

State
-----
SyncedDB is still under development. Expect rough edges.

Main features
--------
* No new abstractions on top of IndexedDB. It exposes the same
  raw power and performane — just through a significantly more convenient API.
* Compact declarative store and index definitions with automatic upgrades.
* Uses promises for all async operations — even inside IndexedDB transactions
* Synchronizes data through WebSockets and sends only modifications to records
  down the wire. This makes the network usage light and efficient.
* Simple but powerful conflict handling.
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
make sure to wipe client site data as well by running 
`indexedDB.deleteDatabase('todoApp');` in the browsers console.

API documentation
-----------------
Beware, the documentation is in very early stages.

## syncedDB.open(options)
Opens a new or existing database.

__Arguments__

* `options` (object): The options object is an object with the following properties
  * `name` - the name of the database to open.
  * `version` - the version of the database to open.
  * `stores` - An object declaring the stores in the database and their indexes.
  * [`remote`] - An URL specifying the location of the remote to which the client should sync.
  * [`migrations`] - An object with keys matching callbacks to execute when the database is upgraded.

__Returns__

`SDBDatabase`: The opened database.

__Example__

```
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

## SDBDatabase
Provides easy access to the stores it contains and their indexes.
It provides means to opening transactions on the database. 

__Properties__

* `name` - the name of the database
* `db` - the raw IDBDatabase associated with the database
* `version` - the version of the database
* `remote` - the address to which the database should sync
* `stores` - an array of the SDBIndexes belonging to the store
* `messages` - an event emitter which emits custom events from the server

Furthermore the databases stores is directly attached to the database object as long
as they don't collide with any existing properties.

## SDBStore
Gives easy access to querying the records it contains, both with primary keys and
through indexes.

__Properties__

## SDBIndex

__Properties__

Database declarations
=====================


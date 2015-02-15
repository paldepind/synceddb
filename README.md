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

Storage options
---------------

SyncedDB makes it easy to use different server side persistence strategies. These
are easy to write (take a look at the existing options) and a test suite is
provided.

Currently persistence options based on the following databases are provided:
 
* In memory (for developing)
* MySQL
* PostgreSQL
* CouchDB

Todo
----------------
* API for IndexedDB cursors
* Handle terminated connections with the server
* Add more documentation and additional examples

Example
-------

__Client__

```javascript
var stores = {
  tasks: [ // One store named 'tasks'.
    ['byCreation', 'createdAt'] // With one index into the 'createdAt' property.
  ]
};

var db = syncedDB.open({ // Open database.
  name: 'todoApp',
  version: 1,
  stores: stores,
  remote: 'localhost:8080',
});

db.tasks.put({ // Add one task to database.
  description: 'Task description',
  finished: false,
  createdAt: Date.now()
});

db.tasks.byCreation.getAll() // Get all task elements sorted after creation.
.then(function(tasks) {
  tasks.forEach(createTaskElm);
});

db.tasks.on('add', function(e) { // A new task element pushed from remote.
  createTaskElm(e.record); // Handle task.
});

// Start syncing continously, the server will now.
// push and pull changes in real time.
db.syncContinuously('tasks');
```

__Server__

```
var Server = require('synceddb-server');

// Persistence with PostreSQL.
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

[API documentation](https://github.com/paldepind/synceddb/blob/master/API.md)

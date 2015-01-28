SyncedDB
========
SyncedDB makes it easy to write offline-first applications with realtime
syncing and server side persistence.

About
-----
SyncedDB is a thin wrapper around IndexedDB. It provides hightly increased
convenience compared to raw IndexedDB and continous or on demand data
synchronization to a remote backend. Thus SyncedDB assists in writing web
applications that works beautifully both online and offline.

Why
---
Since the arrival and widestream adoption of IndexedDB writing web applications
with full offline support has been possible. But when storing data offline web
applications looses the feature of seamlessly making a users data available
across devices. SyncedDB is a library that gives web applications the best of
both worlds: a fully functional offline experience with real-time or on demand
synchronization of data when online.

When using SyncedDB web application developers can simply write the client site
code as if everything was stored offline. Plug in a remote backend and SyncedDB
takes care of the synchronization!

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
relevant points and extend the communication with the client through custom
messages.

State
-----
SyncedDB is still under development. Expect rough edges and consider helping
out in polishing them away.

Main features
--------
* Does not add any new abstractions on top of IndexedDB. It exposes the same
  raw power — just through a significantly more convenient API.
* Compact declarative store and index definitions with automatic upgrades.
* Uses promises for all async operations — even inside IndexedDB transactions
* Synchronizes data through WebSockets and sends only modifications to records
  down the wire. This makes the network usage light and efficient.
* Simple but powerful conflict handling
* Simple and highly flexible backend. Bring your own server side validations,
  authentication, authorization, etc. Plug in any database you like and store data
  any way you want alongside the format that SyncedDB uses internally.

Major missing features
----------------
* API for IndexedDB cursors
* More persistence options – currently only PostreSQL and in memory (for developing)
 is supported. These are easy to write though! Check out the existing one, start
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

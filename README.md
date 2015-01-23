SyncedDB
========
SyncedDB makes it easy to write offline-first applications with realtime
syncing and server side persistence.

About
-----
SyncedDB is a thin wrapper around IndexedDB. It provides hightly increased
convenience compared to raw IndexedDB and continous or on demand data
synchronization to a remote backend. Thus SyncedDB makes it easy to write web
applications that works beautifully both online and offline.

State
-----
SyncedDB is still under development. Expect rough edges and consider helping
out in polishing the away.

Major features
--------
* Does not add any further abstractions on top of IndexedDB. It exposes the same
  raw power — just through a significantly more convenient API.
* Compact declarative store and index definitions with automatic upgrades.
* Uses promises for all async operations — even inside IndexedDB transactions
* Synchronizes data through WebSockets and sends only modifications to records
  down the wire. This makes the network usage light and efficient.
* Simple but powerful conflict handling
* Simple and highly flexible backend. Bring your own server side validations,
  authentication, authorization. Plug in any database you like and store data
  any way you want alongside the format that SyncedDB uses internally.

Major missing features
----------------
* API for IndexedDB cursors
* Backend persistence (currently in memory only)

Try it
------
Get the repository
```
git clone https://github.com/paldepind/synceddb.git
cd synceddb
```
Get server and client dependencies
```
npm install
bower install
```
Start server
```
node server/server.js
```
Open the todo app example in a few different browsers
```
firefox examples/todo/index.html
google-chrome examples/todo/index.html
```
Try adding, toggling and deleting todo items. You will see
that changes are synchronized instantly between the
connected clients.

SyncedDB
========
IndexedDB wrapper adding convenience and automatic synchronization.

About
-----
SyncedDB is a wrapper around IndexedDB. It provides a convenient API that uses
promises for async operations. It supports on demand or live continuous data
synchronization to a remote backend. Thus SyncedDB makes it easy to write web
applications that works beautifully both online and offline.

State
-----
SyncedDB is still under development. A lot of things works already – but a whole
bunch of critical features are still missing. Especially with regards to the backend.

Features
--------
* Uses promises for async operations — even inside IndexedDB transactions
* Does not add any new abstractions on top of IndexedDB. It exposes the same
  power — just through a significantly more convenient API.
* Compact declarative store and index definitions with automatic upgrades.
* Synchronizes data through WebSockets and sends only modifications to records
  down the wire. This makes the network usage light and efficient.
* Powerful conflict handling
* and more

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


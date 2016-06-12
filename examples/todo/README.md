Todo example
============

Try it
------

Get the repository
```
git clone https://github.com/paldepind/synceddb.git && cd synceddb/
```
Get dependencies
```
npm install
```
Go to the todo example directory:
```
cd examples/todo
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

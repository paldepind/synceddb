#!/bin/bash

# Build global
cat ./wrappers/global-pre.js ./bower_components/dffptch/dffptch.js ./synceddb.js ./wrappers/global-post.js > ./dist/synceddb-global.js
cat ./dist/synceddb-global.js | uglifyjs -c -m > dist/synceddb-global.min.js

# 'Build' CommonJS/Node
cat ./bower_components/dffptch/dffptch.js ./synceddb.js > ./dist/synceddb-node.js

# Build AMD/Require.JS
cat ./wrappers/amd-pre.js ./bower_components/dffptch/dffptch.js ./synceddb.js ./wrappers/amd-post.js > ./dist/synceddb-amd.js
cat ./dist/synceddb-amd.js | uglifyjs -c -m > dist/synceddb-amd.min.js

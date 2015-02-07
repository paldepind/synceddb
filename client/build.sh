#!/bin/bash

cat ./bower_components/dffptch/dffptch.js ./bower_components/sync-promise/index.js ./synceddb.js > ./dist/temp.js

# Build global
cat ./wrappers/global-pre.js ./dist/temp.js ./wrappers/global-post.js > ./dist/synceddb-global.js
cat ./dist/synceddb-global.js | uglifyjs -c -m > dist/synceddb-global.min.js

# 'Build' CommonJS/Node
cat ./dist/temp.js > ./dist/synceddb-node.js

# Build AMD/Require.JS
cat ./wrappers/amd-pre.js ./dist/temp.js ./wrappers/amd-post.js > ./dist/synceddb-amd.js
cat ./dist/synceddb-amd.js | uglifyjs -c -m > dist/synceddb-amd.min.js

rm ./dist/temp.js

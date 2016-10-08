#!/usr/bin/env bash

set -e

SEM_SCOPE=$1

if [[ -z "$SEM_SCOPE" ]]; then
    echo "Usage: ./publish_all.sh patch"
    exit 1
fi

(cd ./couchdb  && npm version $SEM_SCOPE && npm publish)
(cd ./memory && npm version $SEM_SCOPE && npm publish)
(cd ./mysql && npm version $SEM_SCOPE && npm publish)
(cd ./postgresql && npm version $SEM_SCOPE && npm publish)

exit 0

SyncedDB persistence providers
------------------------------

The SyncedDB NodeJS server decouples persistence from the rest of the servers
functionality. This makes it possible for the server to use different
databases and storage formats. It furthermore makes it possible for users
to extend the default persistence providers to their own specific needs.

Persistence interface
---------------------

A module that implements the persistence interface must export a function
named `create`. Once called, with arguments specific for the persistence strategy,
it must return an object with the following methods:

### persistence.saveChange(change)

The change received can take three different forms as specified by
the type property of the change object.

A new change is returned with a timestamp and in some cases additional
properties added by the persistence provider.

#### Create change

__Arguments__
* `change` (object): The change to save. Properties:
  * `type` (string): Has the value `'create'`.
  * `storeName` (string): The store to which the changed record belongs.
  * `key` (string|number): Key of the record that the change applies to.
  * `record` (object): Associated record. Only defined if `type == 'create'`.

__Returns__
* `change` (object): The stored change.
  * `type` (string): Unchanged.
  * `storeName` (string): Unchanged.
  * `record` (object): Unchanged.
  * `key` (string|number): The key that the change was stored as. This need
    not be the same as the key received.
  * `timestamp` (\*): Timestamp at which the change was stored.
  * `version` (\*): The initial version of the created record.

#### Update change

__Arguments__

* `change` (object): The change to save. Properties:
  * `type` (string): Has the value `'update'`.
  * `storeName` (string): The store to which the changed record belongs.
  * `key` (string|number): Key of the record that the change applies to.
  * `version` (\*): The version to which the change is applied. Not specified
    for changes of type `'create'`.
  * `diff` (object): Associated diff.

__Returns__

* `change` (object): The stored change.
  * `type` (string): Unchanged.
  * `storeName` (string): Unchanged.
  * `key` (string|number): Unchanged.
  * `diff` (object): Unchanged.
  * `version` (\*): The new version of the changed record.
  * `timestamp` (\*): Timestamp at which the change was stored.

#### Delete change

__Arguments__

* `change` (object): The change to save. Properties:
  * `type` (string): Has the value `'delete'`.
  * `storeName` (string): The store to which the changed record belongs.
  * `key` (string|number): Key of the record that the change applies to.
  * `version` (\*): The version to which the change is applied. Not specified
    for changes of type `'create'`.

__Returns__

* `change` (object): The stored change.
  * `type` (string): Unchanged.
  * `storeName` (string): Unchanged.
  * `key` (string|number): Unchanged.
  * `version` (\*): The new version of the changed record.

### persistence.getChanges(change)

### persistence.resetChanges(change)

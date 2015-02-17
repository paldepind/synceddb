Counters example
================

The counters example demonstrates conflict handling. It is an app in which the
user can create counters and increase their value.

If the user increases a counter by 3 on one offline device and by 2 on another
offline device when they have both successfully synced the final value will end
up being 5.

The magic happens inside the client side conflict handler:

```javascript
db.counters.handleConflict = function(original, local, remote) {
  var locallyAdded = local.count - original.count;
  local.count = locallyAdded + remote.count;
  return local;
};
```

By comparing the current local record with the record originally
synchronized with the server the client calculates how many times
the count has been increased. This is added to the current remote
count and a final value is found.

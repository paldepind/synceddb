(function (exports) {
// dffptch

var O = Object; // Our own binding to Object – global objects can't be minified
var keys = O.keys; // Same for keys, we use this funcion quite a bit

exports.diff = function diff(a, b) {
  var aKeys = keys(a).sort(),
      bKeys = keys(b).sort(),
      delta = {}, adds = {}, mods = {}, dels = [], recurses = {},
      aI = 0, bI = 0;
  // Continue looping as long as we haven't reached the end of both keys lists
  while(aKeys[aI] || bKeys[bI]) {
    var aKey = aKeys[aI], shortAKey = String.fromCharCode(aI+48),
        bKey = bKeys[bI],
        aVal = a[aKey], bVal = b[bKey];
    if (aKey == bKey) {
      // We are looking at two equal keys this is a
      // change – possibly to an object or array
      if (O(aVal) === aVal && O(bVal) === bVal) {
        // Find changs in the object recursively
        var rDelta = diff(aVal, bVal);
        // Add recursive delta if it contains modifications
        if(keys(rDelta)[0]) recurses[shortAKey] = rDelta;
      } else if (aVal !== bVal) {
        mods[shortAKey] = bVal;
      }
      aI++; bI++;
    } else if (aKey > bKey || !aKey) {
      // aKey is ahead, this means keys have been added to b
      adds[bKey] = bVal;
      bI++;
    } else {
      // bKey is larger, keys have been deleted
      dels.push(shortAKey);
      aI++;
    }
  }
  // We only add the change types to delta if they contains changes
  if (dels[0]) delta.d = dels;
  if (keys(adds)[0]) delta.a = adds;
  if (keys(mods)[0]) delta.m = mods;
  if (keys(recurses)[0]) delta.r = recurses;
  return delta;
};

exports.patch = function patch(obj, delta) {
  var operation, key, val, longKey, objKeys = keys(obj).sort();
  for (operation in delta) {
    // Operation is either 'a', 'm', 'd' or 'r'
    for (key in delta[operation]) {
      val = delta[operation][key];
      longKey = objKeys[(operation != 'd' ? key : val).charCodeAt()-48];
      operation == 'a' ? obj[key] = val : // addition
      operation == 'm' ? obj[longKey] = val : // modification
      operation == 'd' ? delete obj[longKey] : // deletion
                        patch(obj[longKey], val); // recuse
    }
  }
};
}(this.syncedDB = {}));

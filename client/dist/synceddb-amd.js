define(function () {
  var exports = {};

// dffptch

var O = Object; // Our own binding to Object – global objects can't be minified
var keys = O.keys; // Same for keys, we use this funcion quite a bit

var dffptch = {
  diff: function diff(a, b) {
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
  },
  patch: function patch(obj, delta) {
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
  }
};
function isPromise(p) {
  return p && typeof p.then === 'function';
}

// States
var PENDING = 2,
    FULFILLED = 0, // We later abuse these as array indices
    REJECTED = 1;

function SyncPromise(fn) {
  var self = this;
  self.v = 0; // Value, this will be set to either a resolved value or rejected reason
  self.s = PENDING; // State of the promise
  self.c = [[],[]]; // Callbacks c[0] is fulfillment and c[1] is rejection callbacks
  self.a = false; // Has the promise been resolved synchronously
  var syncResolved = true;
  function transist(val, state) {
    self.a = syncResolved;
    self.v = val;
    self.s = state;
    if (state === REJECTED && !self.c[state].length) {
      throw val;
    }
    self.c[state].forEach(function(fn) { fn(val); });
    self.c = null; // Release memory.
  }
  function resolve(val) {
    if (!self.c) {
      // Already resolved, do nothing.
    } else if (isPromise(val)) {
      val.then(resolve).catch(reject);
    } else {
      transist(val, FULFILLED);
    }
  }
  function reject(reason) {
    if (!self.c) {
      // Already resolved, do nothing.
    } else if (isPromise(reason)) {
      reason.then(reject).catch(reject);
    } else {
      transist(reason, REJECTED);
    }
  }
  fn(resolve, reject);
  syncResolved = false;
}

var prot = SyncPromise.prototype;

prot.then = function(cb) {
  var self = this;
  if (self.a) { // Promise has been resolved synchronously
    throw new Error('Can not call then on synchonously resolved promise');
  }
  return new SyncPromise(function(resolve, reject) {
    function settle() {
      try {
        resolve(cb(self.v));
      } catch(e) {
        reject(e);
      }
    }
    if (self.s === FULFILLED) {
      settle();
    } else if (self.s === REJECTED) {
      reject(self.v);
    } else {
      self.c[FULFILLED].push(settle);
      self.c[REJECTED].push(reject);
    }
  });
};

prot.catch = function(cb) {
  var self = this;
  if (self.a) { // Promise has been resolved synchronously
    throw new Error('Can not call catch on synchonously resolved promise');
  }
  return new SyncPromise(function(resolve, reject) {
    function settle() {
      try {
        resolve(cb(self.v));
      } catch(e) {
        reject(e);
      }
    }
    if (self.s === REJECTED) {
      settle();
    } else if (self.s === FULFILLED) {
      resolve(self.v);
    } else {
      self.c[REJECTED].push(settle);
      self.c[FULFILLED].push(resolve);
    }
  });
};

SyncPromise.all = function(promises) {
  return new SyncPromise(function(resolve, reject, l) {
    l = promises.length;
    promises.forEach(function(p, i) {
      if (isPromise(p)) {
        p.then(function(res) {
          promises[i] = res;
          --l || resolve(promises);
        }).catch(reject);
      } else {
        --l || resolve(promises);
      }
    });
  });
};

  return exports;
});

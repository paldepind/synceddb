class Countdown {
  constructor(initial) {
    this.val = initial || 0;
  }
  add(n) {
    this.val += n;
    if (this.val === 0) this.onZero();
  }
}

module.exports = Countdown;

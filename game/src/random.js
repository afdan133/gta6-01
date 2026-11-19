// Seeded RNG (mulberry32): the whole city and its crowds come from one seed, so a given
// seed always builds the same city and the same traffic patterns.

export function createRandom(seed) {
  let s = seed >>> 0;
  function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    seed,
    next,
    range(a, b) { return a + next() * (b - a); },  // float in [a, b)
    int(a, b) { return Math.floor(a + next() * (b - a + 1)); }, // int in [a, b]
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    chance(p) { return next() < p; },
  };
}

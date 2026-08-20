// Faithful port of java.util.Random (the linear congruential generator),
// so anything seeded from game data (e.g. dungeon generation, which seeds
// with `dungeonIndex * 8000`) produces the same sequence the original did.

const MULTIPLIER = 0x5DEECE66Dn;
const ADDEND = 0xBn;
const MASK = (1n << 48n) - 1n;

export class JavaRandom {
  constructor(seed) {
    this.setSeed(seed);
  }

  setSeed(seed) {
    this.seed = (BigInt(seed) ^ MULTIPLIER) & MASK;
  }

  next(bits) {
    this.seed = (this.seed * MULTIPLIER + ADDEND) & MASK;
    // signed right shift of the top (48 - bits) bits, as a 32-bit signed int
    let result = Number(this.seed >> BigInt(48 - bits));
    // Java's `next` returns an int; values with bit 31 set are negative.
    if (bits === 32 && result >= 0x80000000) {
      result -= 0x100000000;
    }
    return result;
  }

  nextInt(bound) {
    if (bound === undefined) {
      return this.next(32);
    }
    if (bound <= 0) throw new Error('bound must be positive');
    if ((bound & -bound) === bound) {
      // power of 2
      return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    }
    let bits, val;
    do {
      bits = this.next(31);
      val = bits % bound;
    } while (bits - val + (bound - 1) < 0);
    return val;
  }

  nextBoolean() {
    return this.next(1) !== 0;
  }

  nextLong() {
    const hi = BigInt(this.next(32));
    const lo = BigInt(this.next(32) >>> 0);
    return (hi << 32n) + lo;
  }

  nextDouble() {
    const hi = BigInt(this.next(26));
    const lo = BigInt(this.next(27));
    return Number((hi << 27n) + lo) / Number(1n << 53n);
  }
}

// Math.abs(value % divisor), matching Java's truncating remainder — used
// throughout the original's dungeon generator (java_abs_mod in the
// reference). JS's `%` already truncates toward zero like Java's does, so
// this is just an abs() wrapper.
export function javaAbsMod(value, divisor) {
  return Math.abs(value % divisor);
}

// Self-check for lib/preload.ts:  node scripts/preload.check.mjs  (Node 22.18+ strips types)
import assert from "node:assert/strict";
import { preloadTarget, targetFor } from "../lib/preload.ts";

const GB = 1024 ** 3;
const floor = 8 * GB;
// 25% of a 28 GB movie with plenty of room.
assert.deepEqual(preloadTarget(28 * GB, 25, 100 * GB, floor), { bytes: 7 * GB, capped: false });
// Only 2.5 GB above the reserve: capped, still queued.
assert.deepEqual(preloadTarget(28 * GB, 25, 10.5 * GB, floor), { bytes: 2.5 * GB, capped: true });
// Under the minimum, or no room at all: refuse.
assert.equal(preloadTarget(28 * GB, 25, 8.1 * GB, floor), null);
assert.equal(preloadTarget(28 * GB, 25, 5 * GB, floor), null);
// 100% = the whole file when it fits, capped when it doesn't.
assert.deepEqual(preloadTarget(4 * GB, 100, 20 * GB, floor), { bytes: 4 * GB, capped: false });
assert.deepEqual(preloadTarget(28 * GB, 100, 20 * GB, floor), { bytes: 12 * GB, capped: true });
// A small file that fits is taken whole even below the minimum.
assert.deepEqual(preloadTarget(100 * 1024 ** 2, 25, 9 * GB, floor), { bytes: 100 * 1024 ** 2, capped: false });

// Download choices.
assert.deepEqual(targetFor("full", 4 * GB, 25, 20 * GB, floor), { bytes: 4 * GB, capped: false });
assert.equal(targetFor("full", 28 * GB, 25, 20 * GB, floor), null); // whole file or nothing
assert.deepEqual(targetFor("percent", 28 * GB, 25, 100 * GB, floor), { bytes: 7 * GB, capped: false });
assert.deepEqual(targetFor("fit", 28 * GB, 25, 12 * GB, floor), { bytes: 4 * GB, capped: true });
assert.deepEqual(targetFor("fit", 4 * GB, 25, 100 * GB, floor), { bytes: 4 * GB, capped: false });
console.log("preload ok");

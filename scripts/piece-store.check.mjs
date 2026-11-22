// Self-check for lib/piece-store.mjs:  node scripts/piece-store.check.mjs
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import PieceStore from "../lib/piece-store.mjs";

const dir = join(mkdtempSync(join(tmpdir(), "piece-store-")), ".pieces");
const store = new PieceStore(4, { length: 10, dir }); // pieces: 4, 4, 2
const put = promisify(store.put.bind(store));
const get = promisify(store.get.bind(store));
const unlink = promisify(store.unlink.bind(store));

await put(0, Buffer.from("abcd"));
await put(1, Buffer.from("efgh"));
await put(2, Buffer.from("ij"));
await assert.rejects(put(1, Buffer.from("x")), /Chunk length/);
await assert.rejects(put(2, Buffer.from("ijk")), /Chunk length must be 2/);

assert.equal((await get(0, null)).toString(), "abcd");
assert.equal((await get(1, { offset: 1, length: 2 })).toString(), "fg");
assert.equal((await get(2, { length: 2 })).toString(), "ij");
await assert.rejects(get(2, { offset: 1, length: 2 }), /Invalid/);

// Dropping a piece makes it missing; dropping it twice is fine.
await unlink(1);
await unlink(1);
await assert.rejects(get(1, null), /ENOENT/);
assert.equal((await get(0, null)).toString(), "abcd");

await promisify(store.destroy.bind(store))();
await assert.rejects(get(0, null));
console.log("piece-store ok");

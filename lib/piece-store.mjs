// A WebTorrent chunk store that keeps every piece as its own file, so pieces
// already watched can be deleted mid-stream (Settings → Storage optimization).
// The default fs-chunk-store writes into one real file per torrent file, and
// Node can't free bytes from the middle of a file on macOS.
//
// Layout: <dir>/<pieceIndex>. One 4K movie of 28 GB at 16 MB pieces is ~1,800
// files at most, and with the rolling window only a few hundred at once.
import { mkdir, readFile, writeFile, rm, unlink } from "fs";
import { join } from "path";

export default class PieceStore {
  constructor(chunkLength, opts) {
    this.chunkLength = Number(chunkLength);
    this.length = opts.length;
    this.lastChunkLength = this.length % this.chunkLength || this.chunkLength;
    this.lastChunkIndex = Math.ceil(this.length / this.chunkLength) - 1;
    this.dir = opts.dir;
    this.closed = false;
    this._ready = new Promise((ok, fail) =>
      mkdir(this.dir, { recursive: true }, (err) => (err ? fail(err) : ok())),
    );
  }

  _len(index) {
    return index === this.lastChunkIndex ? this.lastChunkLength : this.chunkLength;
  }

  put(index, buf, cb = () => {}) {
    if (this.closed) return queueMicrotask(() => cb(new Error("Storage is closed")));
    if (buf.length !== this._len(index)) {
      return queueMicrotask(() => cb(new Error(`Chunk length must be ${this._len(index)}`)));
    }
    this._ready.then(
      () => writeFile(join(this.dir, String(index)), buf, cb),
      cb,
    );
  }

  get(index, opts, cb) {
    if (typeof opts === "function") return this.get(index, null, opts);
    if (this.closed) return queueMicrotask(() => cb(new Error("Storage is closed")));
    const from = opts?.offset || 0;
    const to = opts?.length ? from + opts.length : this._len(index);
    if (from < 0 || to > this._len(index)) {
      return queueMicrotask(() => cb(new Error("Invalid offset and/or length")));
    }
    readFile(join(this.dir, String(index)), (err, buf) => {
      if (err) return cb(err);
      cb(null, from === 0 && to === buf.length ? buf : buf.subarray(from, to));
    });
  }

  /** Delete one piece from disk (missing is fine). */
  unlink(index, cb = () => {}) {
    unlink(join(this.dir, String(index)), (err) => cb(err?.code === "ENOENT" ? null : err));
  }

  close(cb = () => {}) {
    this.closed = true;
    queueMicrotask(() => cb(null));
  }

  destroy(cb = () => {}) {
    this.closed = true;
    rm(this.dir, { recursive: true, force: true }, cb);
  }
}

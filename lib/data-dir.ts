import "server-only";
import { resolve, join, dirname } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";

// Where movies (and the library, history, downloads) live.
//
// The choice is saved once per user in ~/.spaceflix/data-dir as a path on the
// COMPUTER, and read by both ways of running the app:
//   - on the Mac/PC directly, as is;
//   - in Docker, the container gets the user's home at /host (HOST_HOME tells
//     it what that is on the computer), so a computer path under home maps to
//     /host/…; the Makefile also mounts the chosen folder at /app/data.
// So picking a folder in Settings works in both modes and they never disagree.

const inDocker = () => process.env.SPACEFLIX_DOCKER === "1";
const HOST_ROOT = "/host"; // the user's home, inside the container
// Windows kit: every drive is mounted at /drives/<letter> (C: → /drives/c),
// so Settings can pick any folder on any drive while the app runs.
const DRIVES = "/drives";
const THIS_PC = "This PC"; // how the picker shows /drives

/** Computer path → path this process can open. Identity outside Docker. */
/**
 * A computer path, made absolute. Windows paths (C:\\… or D:/…) arrive in a
 * Linux container, where resolve() would glue them onto the cwd: keep them as
 * drive paths with forward slashes, like the kit's HOST_HOME/HOST_DATA_DIR.
 */
export function absHostPath(p: string): string {
  if (p === THIS_PC) return p;
  if (/^[A-Za-z]:([\\/]|$)/.test(p)) return p.replace(/\\/g, "/").replace(/\/+$/, "");
  return resolve(p);
}

/** `p` is `dir` or inside it. Drive paths (Windows) ignore case. */
function within(p: string, dir: string | undefined): dir is string {
  if (!dir) return false;
  const [a, b] = /^[A-Za-z]:/.test(dir) ? [p.toLowerCase(), dir.toLowerCase()] : [p, dir];
  return a === b || a.startsWith(b + "/");
}

export function toLocalPath(hostPath: string): string {
  if (!inDocker()) return hostPath;
  const data = process.env.HOST_DATA_DIR;
  if (within(hostPath, data)) {
    return "/app/data" + hostPath.slice(data.length);
  }
  const home = process.env.HOST_HOME;
  if (within(hostPath, home)) {
    return HOST_ROOT + hostPath.slice(home.length);
  }
  if (hostPath === THIS_PC) return DRIVES;
  const drive = /^([A-Za-z]):(\/.*)?$/.exec(hostPath);
  if (drive && existsSync(`${DRIVES}/${drive[1].toLowerCase()}`)) {
    return `${DRIVES}/${drive[1].toLowerCase()}${drive[2] ?? ""}`;
  }
  return hostPath;
}

/** Path this process uses → the same folder as the computer sees it. */
export function toHostPath(localPath: string): string {
  if (!inDocker()) return localPath;
  const data = process.env.HOST_DATA_DIR;
  if (data && (localPath === "/app/data" || localPath.startsWith("/app/data/"))) {
    return data + localPath.slice("/app/data".length);
  }
  const home = process.env.HOST_HOME;
  if (home && (localPath === HOST_ROOT || localPath.startsWith(HOST_ROOT + "/"))) {
    return home + localPath.slice(HOST_ROOT.length);
  }
  if (localPath === DRIVES) return THIS_PC;
  const drive = /^\/drives\/([a-z])(\/.*)?$/.exec(localPath);
  if (drive) return `${drive[1].toUpperCase()}:${drive[2] ?? "/"}`;
  return localPath;
}

/** Where the Settings folder picker starts browsing (a local path). */
export function getMediaRoot(): string {
  if (inDocker()) {
    if (existsSync(DRIVES)) return DRIVES; // Windows: start at "This PC"
    return process.env.HOST_HOME ? HOST_ROOT : "/app/data";
  }
  return resolve(process.env.MEDIA_ROOT || homedir());
}

/** The saved choice (a local path to the pointer file). */
function pointerPath(): string {
  return inDocker() && process.env.HOST_HOME
    ? join(HOST_ROOT, ".spaceflix", "data-dir")
    : join(homedir(), ".spaceflix", "data-dir");
}

/**
 * Where a new install keeps its movies, per system:
 * macOS ~/Movies/Spaceflix · Windows D:\Movies\Spaceflix (else ~\Videos\Spaceflix)
 * · Linux ~/Videos/Spaceflix.
 */
export function defaultMoviesDir(): string {
  if (process.platform === "win32" && existsSync("D:\\")) return "D:\\Movies\\Spaceflix";
  // The system's movie folder (Mac Movies, else Videos), else Downloads.
  const home = homedir();
  const movies = join(home, process.platform === "darwin" ? "Movies" : "Videos");
  return join(existsSync(movies) ? movies : join(home, "Downloads"), "Spaceflix");
}

function readPointer(path: string): string | null {
  try {
    return readFileSync(path, "utf-8").trim() || null;
  } catch {
    return null;
  }
}

// Resolution order: the saved choice (~/.spaceflix/data-dir, or the older
// per-project .active-data-dir) > DATA_DIR env > Docker's mounted folder > an
// existing ./data (installs from before the per-system default) > the
// system's movie folder.
export function getDataDir(): string {
  const saved =
    readPointer(pointerPath()) ??
    (inDocker() ? null : readPointer(resolve(process.cwd(), ".active-data-dir")));
  if (saved) {
    const host = absHostPath(saved);
    const local = toLocalPath(host);
    // In Docker, a folder outside the shared home can't be reached — skip it
    // and use the mounted folder (never a path inside the container).
    if (!inDocker() || local !== host) return local;
  }
  const envDir = process.env.DATA_DIR;
  if (envDir) return resolve(envDir);
  const local = resolve(process.cwd(), "data");
  if (inDocker()) return local; // the mounted folder
  if (existsSync(join(local, "library.json"))) return local;
  return defaultMoviesDir();
}

/** The data folder as the computer sees it (differs from getDataDir in Docker). */
export function getHostDataDir(): string {
  return toHostPath(getDataDir());
}

/**
 * Switch folders. `newPath` is what the picker shows — a computer path.
 * In Docker it must be inside the shared home, or it would end up inside the
 * container and be lost with it.
 */
export function setDataDir(newPath: string): string {
  const hostPath = absHostPath(newPath);
  const local = toLocalPath(hostPath);
  if (inDocker() && local === hostPath) {
    throw new Error("Docker can't reach that folder. Pick one in your home folder, or on a drive listed under This PC.");
  }
  mkdirSync(local, { recursive: true });
  const pointer = pointerPath();
  mkdirSync(dirname(pointer), { recursive: true });
  writeFileSync(pointer, hostPath);
  return local;
}

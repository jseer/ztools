import path from "path";
import os from "os";

const windowsSlashRE = /\\/g;
function slash(p: string): string {
  return p.replace(windowsSlashRE, "/");
}

const isWindows = os.platform() === "win32";
function normalizePath(id: string): string {
  return path.posix.normalize(isWindows ? slash(id) : id);
}

export default normalizePath;
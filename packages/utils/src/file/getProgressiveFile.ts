import path from "path";
import fs from "fs";

function getFilePathAdd(dir: string, filename: string, ext: string, start = 1): string {
  const uniquePath = path.join(dir, filename + start++ + ext);
  if (fs.existsSync(uniquePath)) {
    return getFilePathAdd(dir, filename, ext, start);
  }
  return uniquePath;
}
export default function getProgressiveFile(filePath: string, ext?: string[] | string) {
  if (fs.existsSync(filePath)) {
    let j: number, basename: string, tmp: string;
    const o = path.extname(filePath);
    const exts = ext ? (Array.isArray(ext) ? ext : [ext]) : [];
    const oIndex = exts.indexOf(o);
    if (oIndex == -1) {
      exts.push(o);
    } else if (oIndex !== exts.length - 1) {
      tmp = exts[oIndex];
      exts[oIndex] = exts[exts.length - 1];
      exts[exts.length - 1] = tmp;
    }
    let i = exts.length,
      m = Infinity;
    while (--i >= 0) {
      const b = path.basename(filePath, exts[i]);
      if (b.length < m) {
        j = i;
        basename = b;
        m = b.length;
      }
    }
    return getFilePathAdd(path.dirname(filePath), basename!, exts[j!]);
  }
  return filePath;
}

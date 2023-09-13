import path from "path";
import fsp from "fs/promises";
import fs from "fs";
import Mustache from "mustache";
import assert from "assert";
import createDebugger from "../createDebugger";

export interface WriteFileOptions {
  outputPath: string;
  content?: string;
  tpl?: string;
  tplPath?: string;
  context?: object;
}
const debug = createDebugger("utils:writeTplFile");
async function write(outputPath: string, content: string) {
  debug("write outputPath:%s ", outputPath);
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.writeFile(outputPath, content, "utf-8");
}
export default async function writeTplFile(options: WriteFileOptions) {
  let { outputPath, content, tpl, tplPath, context } = options;
  debug("outputPath:%s tplPath:%s", outputPath, tplPath);
  const savePath = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(process.cwd(), outputPath);
  if (!content) {
    assert(
      !tplPath ||
        (fs.existsSync(tplPath) && (await fsp.stat(tplPath)).isFile()),
      `tplPath does not exists or is not a file.`
    );
    tpl = tplPath ? await fsp.readFile(tplPath, "utf-8") : tpl;
    assert(tpl, `tpl or .tplPath must be supplied.`);
    content = Mustache.render(tpl, context);
  }
  if (!fs.existsSync(savePath)) {
    await write(savePath, content);
  } else {
    const stats = await fsp.stat(savePath);
    const buf = Buffer.from(content, "utf-8");
    if (
      !(
        stats.isFile() &&
        stats.size === buf.length &&
        (await fsp.readFile(savePath)).equals(buf)
      )
    ) {
      await write(savePath, content);
    }
  }
}

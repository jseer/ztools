import path from "path";
import fsp from "fs/promises";
import fs from "fs";
import Handlebars from "handlebars";
import assert from "assert";

export interface WriteFileOptions {
  outputPath: string;
  content?: string;
  tpl?: string;
  tplPath?: string;
  context?: object;
  override?: boolean;
}

async function write(outputPath: string, content: string) {
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.writeFile(outputPath, content, "utf-8");
}
export default async function writeTplFile(options: WriteFileOptions) {
  let { outputPath, content, tpl, tplPath, context, override } = options;
  const savePath = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(process.cwd(), outputPath);
  if (!content) {
    assert(
      !tplPath ||
        (fs.existsSync(tplPath) && (await fsp.stat(tplPath)).isFile()),
      `tplPath does not exists or is not a file.`
    );
    assert(tpl, `tpl or .plPath must be supplied.`);
    tpl = tplPath ? await fsp.readFile(tplPath, "utf-8") : tpl;
    content = Handlebars.compile(tpl)(context);
  }
  if (override) {
    await write(savePath, content);
  } else if (!fs.existsSync(savePath)) {
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

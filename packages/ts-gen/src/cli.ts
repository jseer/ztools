import minimist from "minimist";
import { createLogger, writeTplFile } from "@ztools/utils";
import path from "path";
import handler from "./handler";

const logger = createLogger({ tag: "ts-gen" });
export async function start() {
  const argv = minimist(process.argv.slice(2), {
    string: ["_"],
    alias: {
      c: "config",
    },
  });
  if (argv._[0] === "init") {
    await writeTplFile({
      outputPath: `.ts-gen.config.ts`,
      tplPath: path.resolve(__filename, "../tpl/ts-gen.config.tpl"),
      context: {
        defineConfigPath: path.resolve(__dirname, "defineConfig"),
      },
    });
    logger.success("file(.ts-gen.config.ts) written");
  } else {
    await handler({ config: argv.config });
  }
}

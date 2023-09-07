import minimist from "minimist";
import { loadConfigFromFile, formatZError } from "@ztools/utils";
import genCode from "./genCode";
import { configSchema, ConfigOptions } from "./types";

const argv = minimist<{
  c?: string;
  config?: string;
}>(process.argv.slice(2), { string: ["_"] });

async function start() {
  let userConfig = await loadConfigFromFile<ConfigOptions>({
    configFile: argv.config || argv.c,
    defaultConfigFiles: [
      ".z-ts-genrc.ts",
      ".z-ts-genrc.js",
      ".z-ts-gen.config.ts",
      ".z-ts-gen.config.js",
    ],
  });
  let result = configSchema.safeParse(userConfig);
  if (result.success) {
    userConfig = result.data;
  } else {
    throw new Error(formatZError(result.error))
  }
  await genCode(userConfig);
}

start();

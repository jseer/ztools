import minimist from "minimist";
import { loadConfigFromFile, formatZError, isPlainObject } from "@ztools/utils";
import genCode from "./genCode";
import { configSchema, ConfigOptions, ConfigFunction } from "./types";
import assert from "assert";
import { CONFIG_FILES, DEFAULT_ROOT_NAME } from "./utils";

const handler = async (options: { config?: string }) => {
  let userConfig = await loadConfigFromFile<
    ConfigOptions | ConfigFunction | null
  >({
    configFile: options.config,
    defaultConfigFiles: CONFIG_FILES,
  });
  if (typeof userConfig === "function") {
    userConfig = await userConfig({
      DEFAULT_ROOT_NAME,
    });
    assert(
      isPlainObject(userConfig),
      "config function should return an object"
    );
  }
  assert(
    userConfig !== null,
    `please configure one of the files (${CONFIG_FILES.join(" ")})`
  );
  let result = configSchema.safeParse(userConfig);
  if (result.success) {
    userConfig = result.data;
  } else {
    throw new Error(formatZError(result.error));
  }
  return genCode(userConfig);
};

export default handler;

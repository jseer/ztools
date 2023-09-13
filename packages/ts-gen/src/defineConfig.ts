import { ConfigOptions, ConfigFunction } from "./types";

export default function defineConfig(config: ConfigOptions | ConfigFunction): ConfigOptions | ConfigFunction {
  return config;
}

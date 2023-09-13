import colors from "picocolors";
import {
  logLevelSchema,
  loggerEnableSchema,
  LoggerOptions,
  Logger,
  loggerOptionsSchema,
} from "./loggerSchema";
import { z } from "zod";

export const prefixes = {
  info: (type: string) => colors.cyan(type),
  wait: (type: string) => colors.gray(type),
  warn: (type: string) => colors.yellow(type),
  error: (type: string) => colors.red(type),
  ready: (type: string) => colors.magenta(type),
  success: (type: string) => colors.green(type),
};

export type LogLevel = z.infer<typeof logLevelSchema>;

export { LoggerOptions, Logger };

const colorKeys: string[] = Object.keys(colors).filter(
  (key) =>
    typeof colors[key as keyof typeof colors] === "function" &&
    key.startsWith("bg")
);

let lastTagColorIndex = 0;
function getTagColor(tag: string) {
  return (
    tag
      ? colors[
          colorKeys[
            lastTagColorIndex > colorKeys.length - 1
              ? (lastTagColorIndex = 0)
              : lastTagColorIndex++
          ] as keyof typeof colors
        ]
      : () => {}
  ) as (str: string) => string;
}
export default function createLogger(
  options: LoggerOptions = {},
  parent?: Logger
): Logger {
  const valid = loggerOptionsSchema.safeParse(options);
  if (!valid.success) {
    throw new Error(`Invalid logger options: ${valid.error.message}`);
  }
  const { timestamp = true, tag = "", enable = true } = options;
  const timeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const tagColor = getTagColor(tag);
  let enableLevels: Set<LogLevel>;
  let tagEnabled = true;
  let enabled = false;

  function isTagEnable(tag: string, tagRules: string[]): boolean {
    return tagRules.some((rule) => {
      try {
        const reg = new RegExp(rule);
        return reg.test(tag);
      } catch (e) {
        return tag.indexOf(rule) !== -1;
      }
    });
  }
  function handleEnable(enable: LoggerOptions["enable"]) {
    if (enable) {
      enabled = true;
      let tagRules: unknown;
      if (process.env.LOGGER_TAG) {
        tagRules = process.env.LOGGER_TAG.split(",");
      }
      if (process.env.LOGGER_LEVEL) {
        const levels = process.env.LOGGER_LEVEL.split(",");
        const valid = z.array(logLevelSchema).safeParse(levels);
        if (!valid.success) {
          throw new Error(
            `Invalid process.env.LOGGER_LEVEL: ${valid.error.message}`
          );
        }
        enableLevels = new Set<LogLevel>(levels as LogLevel[]);
      }
      if (typeof enable === "object") {
        if (enable.tags) {
          tagRules = enable.tags.split(",");
        }
        if (enable.levels) {
          enableLevels = new Set<LogLevel>(enable.levels);
        }
      } else if (typeof enable === "function") {
        const enableConfig = enable(options, parent);
        const valid = loggerEnableSchema.safeParse(enableConfig);
        if (!valid.success) {
          throw new Error(`Invalid field enable: ${valid.error.message}`);
        }
        handleEnable(enableConfig);
        return;
      }
      if (tagRules) {
        tagEnabled = isTagEnable(tag, tagRules as string[]);
      }
    }
  }
  handleEnable(enable);
  function isEnable(level: LogLevel) {
    return (
      !process.env.LOGGER_DISABLE &&
      enabled &&
      tagEnabled &&
      (enableLevels ? enableLevels.has(level) : true)
    );
  }
  function output(level: LogLevel, message: any[]) {
    if (isEnable(level)) {
      console.log(
        `${
          timestamp
            ? `${colors.dim("(" + timeFormatter.format(new Date()) + ")")} `
            : ""
        }${tag ? tagColor(colors.bold(`[${tag}]`)) + " " : ""}${
          prefixes[level](level) + " -"
        }`,
        ...message
      );
    }
  }
  function mergeOptions(
    source: Record<string, any>,
    target: Record<string, any>
  ) {
    const mergeOpts: Record<string, any> = { ...source };
    for (let key in target) {
      if (key === "tag" && source[key] && target[key]) {
        mergeOpts[key] = source[key] + ":" + target[key];
      } else if (target[key] != null) {
        mergeOpts[key] = target[key];
      }
    }
    return mergeOpts;
  }
  const logger: Logger = {
    parent,
    info(...message: any[]) {
      output("info", message);
    },
    wait(...message: any[]) {
      output("wait", message);
    },
    warn(...message: any[]) {
      output("warn", message);
    },
    error(...message: any[]) {
      output("error", message);
    },
    ready(...message: any[]) {
      output("ready", message);
    },
    success(...message: any[]) {
      output("success", message);
    },
    child(childOptions: LoggerOptions = {}) {
      return createLogger(mergeOptions(options, childOptions), this);
    },
  };
  return logger;
}

import { z } from "zod";

export const logLevelSchema = z.enum([
  "info",
  "wait",
  "warn",
  "error",
  "success",
  "ready",
]);

export const loggerEnableSchema = z.union([
  z.boolean(),
  z.object({
    tags: z.string().optional(),
    levels: z.array(logLevelSchema).nonempty().optional(),
  }),
]);

const baseLoggerOptionsSchema = z.object({
  timestamp: z.boolean().optional(),
  tag: z.string().optional(),
});

export const loggerOptionsSchema: z.ZodType<LoggerOptions> =
  baseLoggerOptionsSchema.extend({
    enable: loggerEnableSchema
      .or(
        z.lazy(() =>
          z.function().args().returns(loggerEnableSchema)
        )
      )
      .optional(),
  });

export interface Logger {
  info(...message: any[]): void;
  wait(...message: any[]): void;
  warn(...message: any[]): void;
  error(...message: any[]): void;
  ready(...message: any[]): void;
  success(...message: any[]): void;
  child(options: LoggerOptions): Logger;
  parent?: Logger | null;
}
export interface Logger {
  info(...message: any[]): void;
  wait(...message: any[]): void;
  warn(...message: any[]): void;
  error(...message: any[]): void;
  ready(...message: any[]): void;
  success(...message: any[]): void;
  child(options: LoggerOptions): Logger;
  parent?: Logger | null;
}
export type LoggerOptions = z.infer<typeof baseLoggerOptionsSchema> & {
  enable?:
    | z.infer<typeof loggerEnableSchema>
    | {
        (options: LoggerOptions, parent?: Logger): z.infer<
          typeof loggerEnableSchema
        >;
      };
};

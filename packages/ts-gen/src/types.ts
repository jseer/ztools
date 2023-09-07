import { z } from "zod";
import { Logger } from "@ztools/utils";
import { ModuleDeclaration, SourceFile } from "ts-morph";

const singleLinkPathSchema = z.union([z.array(z.string()), z.string()]);
const multiLinkPathSchema = z.array(singleLinkPathSchema);
const linkPathSchema = z.union([singleLinkPathSchema, multiLinkPathSchema]);
const extractNameItemSchema = z.object({
  linkPath: linkPathSchema,
  name: z.string(),
  selfExport: z.boolean().optional(),
});
const extractNamesSchema = z.array(extractNameItemSchema);
const itemTsConfigSchema = z.object({
  rootName: z.string(),
  extractNames: extractNamesSchema.optional(),
});

const processDataHandlerSchema = z
  .custom<{
    (data: any): object;
  }>(
    (val) => {
      return typeof val === "function";
    },
    {
      message: "must be a function",
    }
  )
  .optional();
const saveToFileSchema = z
  .union([
    z.string(),
    z.object({
      path: z.string(),
      override: z.boolean().optional(),
    }),
  ])
  .optional();
const httRequestSchema = z.object({
  url: z.string(),
  method: z.string().optional(),
  body: z.custom<object>().optional(),
  headers: z.record(z.string()).optional(),
  saveToFile: saveToFileSchema,
  timeout: z.number().optional(),
  processDataHandler: processDataHandlerSchema,
});
interface Handler {
  (config: ConfigOptions): Promise<object> | object;
}
const customHttpRequestSchema = z.object({
  handler: z.custom<Handler>().refine((val) => typeof val === "function", {
    message: "must be an function",
  }),
  saveToFile: saveToFileSchema,
  processDataHandler: processDataHandlerSchema,
});
const fromLocalSchema = z.object({
  fromFile: z.string(),
  processDataHandler: processDataHandlerSchema,
});
export const configSchema = z.object({
  modules: z.record(
    z.object({
      global: z.boolean().optional(),
      namespaceExport: z.boolean().optional(),
      hidden: z.boolean().optional(),
      output: z
        .object({
          dir: z.string().optional(),
          filename: z.string().optional(),
        })
        .optional(),
      extractNames: extractNamesSchema,
      parallelLimit: z.number().optional(),
      items: z
        .array(
          z.object({
            global: z.boolean().optional(),
            selfExport: z.boolean().optional(),
            namespace: z.string().refine((val) => /^\w+$/.test(val), {
              message: "must be legal",
            }),
            request: z.union([
              httRequestSchema.strict(),
              fromLocalSchema.strict(),
              customHttpRequestSchema.strict(),
            ]),
            tsConfig: itemTsConfigSchema,
            hidden: z.boolean().optional(),
          })
        )
        .nonempty(),
    })
  ),
});

export type ExtractNameItem = z.infer<typeof extractNameItemSchema>;

export type ItemTsConfig = z.infer<typeof itemTsConfigSchema>;

export type FromLocalConfig = z.infer<typeof fromLocalSchema>;

export type HttRequestConfig = z.infer<typeof httRequestSchema>;

export type CustomHttpRequestConfig = z.infer<typeof customHttpRequestSchema>;
export type SingleLinkPath = z.infer<typeof singleLinkPathSchema>;
export type MultiLinkPath = z.infer<typeof multiLinkPathSchema>;
export type MsgItem = { message: string };
export interface Context {
  errors: MsgItem[];
  warnings: MsgItem[];
  finished?: boolean;
}

export interface GenContext extends Context {
  logger: Logger;
  rootDeclaration: ModuleDeclaration;
  tsConfig: ItemTsConfig;
  namespace: string;
  selfDeclare?: boolean;
  moduleExtractNamesMap: Map<string, ExtractNameItemWithDefined>;
  sourceFile: SourceFile;
}

export type ConfigOptions = z.infer<typeof configSchema>;

export type GlobalContext = Record<string, Record<string, Context>>;

export type ExtractNameItemWithDefined = ExtractNameItem & { defined?: string };
export type ExtractNames = z.infer<typeof extractNamesSchema>
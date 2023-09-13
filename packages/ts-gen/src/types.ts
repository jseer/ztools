import { z } from "zod";
import { Logger } from "@ztools/utils";
import {
  ModuleDeclaration,
  SourceFile,
  TypeAliasDeclaration,
  InterfaceDeclaration,
} from "ts-morph";
import { DEFAULT_ROOT_NAME, LINK_PATH_SEP } from './utils';

const singleLinkPathSchema = z.array(z.string())
const multiLinkPathSchema = z.array(singleLinkPathSchema);
const linkPathSchema = z.union([singleLinkPathSchema, multiLinkPathSchema]);
const extractNameItemWithoutChildrenSchema = z.object({
  linkPath: linkPathSchema,
  name: z.string(),
});
export interface ExtractNameItem
  extends z.infer<typeof extractNameItemWithoutChildrenSchema> {
  children?: ExtractNameItem[];
}
const extractNameItemSchema: z.ZodType<ExtractNameItem> =
  extractNameItemWithoutChildrenSchema.extend({
    children: z.lazy(() => extractNamesSchema.optional()),
  });
const extractNamesSchema = z.array(extractNameItemSchema);
const itemTsConfigSchema = z.object({
  rootName: z.string().optional().default("ResDTO"),
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
  timeout: z.number().optional().default(30000),
  processDataHandler: processDataHandlerSchema,
});
export interface Handler {
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
      global: z.boolean().optional().default(true),
      hidden: z.boolean().optional(),
      output: z
        .object({
          dir: z.string().optional(),
          filename: z.string().optional(),
        })
        .optional(),
      extractNames: extractNamesSchema.optional(),
      parallelLimit: z.number().optional().default(3),
      items: z
        .array(
          z.object({
            global: z.boolean().optional().default(true),
            namespace: z.string().refine((val) => /^\w+$/.test(val), {
              message: "must be legal",
            }),
            request: z.union([
              httRequestSchema.strict(),
              fromLocalSchema.strict(),
              customHttpRequestSchema.strict(),
            ]),
            tsConfig: itemTsConfigSchema.optional().default({}),
            hidden: z.boolean().optional(),
          })
        )
        .nonempty(),
    })
  ),
  parallelLimit: z.number().optional().default(2),
});

export type ItemTsConfig = z.input<typeof itemTsConfigSchema>;

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
  extractNamesMap: Map<string, ExtractNameItemWithDefined>;
  sourceFile: SourceFile;
  moduleName: string;
  identifiers: Map<string, string>;
  identifiersInfoMap: Map<string, IdentifiersInfo>;
}

export type ConfigOptions = z.input<typeof configSchema>;

export type GlobalContext = Record<string, Record<string, Context>>;

export type ExtractNameItemWithDefined = ExtractNameItem & {
  defined?: string;
  scope: ScopeEnum;
  originName: string;
  pos: number[];
  fullLinkPaths: Map<string, { index: number; fullPaths: string[]; selfPaths: string[]}>;
  multi?: boolean
};
export type ExtractNames = z.infer<typeof extractNamesSchema>;

export interface IdentifiersInfo {
  links: Set<string>;
  declaration: TypeAliasDeclaration | InterfaceDeclaration;
  scope: ScopeEnum;
}

export interface DefineScope {
  linkName: string;
  scope: ScopeEnum;
}
export interface ProxyIdentifiersContext {
  defineScope: DefineScope;
}

export enum ScopeEnum {
  module,
  namespace,
}

interface ConfigFunctionOptions {
  DEFAULT_ROOT_NAME: typeof DEFAULT_ROOT_NAME;
}
export interface ConfigFunction {
  (options: ConfigFunctionOptions): Promise<ConfigOptions> | ConfigOptions;
}

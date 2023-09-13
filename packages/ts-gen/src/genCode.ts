import {
  ConfigOptions,
  Context,
  HttRequestConfig,
  CustomHttpRequestConfig,
  GlobalContext,
  ExtractNameItemWithDefined,
  IdentifiersInfo,
  ScopeEnum,
} from "./types";
import path from "path";
import fsp from "fs/promises";
import {
  getDefaultFilename,
  getFile,
  MODULE_SELF_KEY,
  getExtractNameChildPos,
} from "./utils";
import prompts from "prompts";
import fs from "fs";
import colors from "picocolors";
import {
  createLogger,
  writeTplFile,
  isPlainObject,
  parallelLimit,
} from "@ztools/utils";
import { Project, ModuleDeclarationKind } from "ts-morph";
import genInterfaceOrAlias from "./genInterfaceOrAlias";
import printTips from "./printTips";
import handleExtractNames, {
  handleRemainingExtractNames,
} from "./handleExtractNames";

export default async function genCode(config: ConfigOptions) {
  const globalContext: GlobalContext = {};
  const project = new Project();
  const { default: fetch, AbortError } = await import("node-fetch");
  await parallelLimit(
    Object.keys(config.modules).map((name) => async () => {
      const logger = createLogger({
        tag: name,
      });
      const m = config.modules[name];
      const {
        output,
        items,
        global: globalDeclare,
        parallelLimit: maxParallelLimit,
        hidden,
        extractNames,
      } = m;
      if (hidden) {
        logger.warn(`module(${name}) has been hidden`);
        return;
      }
      globalContext[name] = {
        [MODULE_SELF_KEY]: {
          errors: [],
          warnings: [],
          finished: false,
        },
      };
      const context = globalContext[name];
      const cwd = process.cwd();
      let outputPath = "";
      if (output) {
        outputPath = path.resolve(
          output.dir ? output.dir : cwd,
          output.filename ? output.filename : getDefaultFilename(name)
        );
      } else {
        outputPath = path.resolve(cwd, getDefaultFilename(name));
      }
      let result: prompts.Answers<"overwrite"> = {
        overwrite: false,
      };
      if (fs.existsSync(outputPath)) {
        try {
          result = await prompts(
            [
              {
                type: "confirm",
                name: "overwrite",
                message: `module(${colors.green(
                  colors.bold(name)
                )}) output to ${colors.dim(
                  outputPath
                )}, file is already exists, do you want to force overwrite`,
              },
            ],
            {
              onCancel: () => {
                throw new Error(colors.red("✖") + "cancelled");
              },
            }
          );
        } catch (e: any) {
          logger.error(e.message);
          process.exit();
        }
        if (!result.overwrite) {
          logger.warn("you choose not to force overwrite");
          outputPath = getFile(outputPath);
          logger.warn(`file ${colors.dim(outputPath)} will be generated`);
        }
      }
      logger.info("outputPath =>", outputPath);
      const extractNamesMap = new Map<string, ExtractNameItemWithDefined>();
      if (
        extractNames &&
        !handleExtractNames({
          extractNames,
          extractNamesMap,
          context: context[MODULE_SELF_KEY],
          fieldPath: (item) => {
            return `extractNames${getExtractNameChildPos(item)}->name`;
          },
          scope: ScopeEnum.module,
          moduleName: name,
        })
      ) {
        return;
      }
      if (items.length) {
        logger.wait("processing");
        const sourceFile = project.createSourceFile(outputPath, "", {
          overwrite: result.overwrite,
        });
        const identifiers = new Map<string, string>();
        const identifiersInfoMap = new Map<string, IdentifiersInfo>();
        const namespaceArr: string[] = [];
        let hasError = false;
        await parallelLimit(
          items.map((item, i) => async () => {
            const {
              request,
              tsConfig,
              namespace,
              global: selfDeclare,
              hidden,
            } = item;
            const itemLogger = logger.child({ tag: namespace });
            if (hidden) {
              itemLogger.warn(`namespace(${namespace}) has been hidden`);
              return;
            }
            try {
              const namespaceIndex = namespaceArr.indexOf(namespace);
              if (namespaceIndex !== -1) {
                context[MODULE_SELF_KEY].errors.push({
                  message: `items[${i}]->namespace(${namespace}) already exists, conflicts with items[${namespaceIndex}]->namespace`,
                });
                return;
              }
              namespaceArr.push(namespace);
              context[namespace] = {
                errors: [],
                warnings: [],
              };
              const namespaceContext = context[namespace];
              itemLogger.wait("get data...");
              let data;
              if ("fromFile" in request && request.fromFile) {
                const { fromFile } = request;
                const localDataPath = path.isAbsolute(fromFile)
                  ? fromFile
                  : path.resolve(fromFile);
                if (!fs.existsSync(localDataPath)) {
                  namespaceContext.errors.push({
                    message: `items->request->fromFile ${colors.dim(
                      localDataPath
                    )} does not exists`,
                  });
                  return;
                }
                try {
                  data = JSON.parse(await fsp.readFile(localDataPath, "utf-8"));
                } catch (e: any) {
                  data = e;
                }
              } else if ("handler" in request && !!request.handler) {
                const { handler } = request as CustomHttpRequestConfig;
                data = await handler(config);
              } else {
                const {
                  url,
                  method = "get",
                  body,
                  headers,
                  timeout,
                } = request as HttRequestConfig;
                const AbortController = globalThis.AbortController;
                const controller = new AbortController();
                const timer = setTimeout(() => {
                  controller.abort("request timeout");
                }, timeout);
                try {
                  const response = await fetch(url, {
                    method,
                    body: body ? JSON.stringify(body) : undefined,
                    headers: {
                      "Content-Type": "application/json",
                      ...headers,
                    },
                    signal: controller.signal,
                  });
                  data = await response.json();
                } catch (e) {
                  if (e instanceof AbortError) {
                    throw new Error("request timeout");
                  }
                  throw e;
                } finally {
                  clearTimeout(timer);
                }
              }
              if (request.processDataHandler) {
                data = await request.processDataHandler(data);
              }
              const isPlainData = isPlainObject(data);
              if (
                "saveToFile" in request &&
                request.saveToFile &&
                isPlainData
              ) {
                const { saveToFile } = request;
                let sPath: string = saveToFile as string;
                let override: boolean | undefined;
                if (typeof saveToFile === "object") {
                  sPath = saveToFile.path;
                  override = saveToFile.override;
                }
                if (!path.isAbsolute(sPath)) {
                  sPath = path.resolve(sPath);
                }
                if (fs.existsSync(sPath) && !override) {
                  namespaceContext.warnings.push({
                    message: `saveToFile: ${sPath} already exists, missing to save file, if need to override, please configure saveToFile->override to true`,
                  });
                } else {
                  await writeTplFile({
                    content: JSON.stringify(data),
                    outputPath: sPath,
                  });
                }
              }
              itemLogger.success("get data finished");
              if (!isPlainData) {
                namespaceContext.errors.push({
                  message: "dataSource(by request) must be an plain object",
                });
                return;
              }
              const moduleDeclaration = sourceFile.addModule({
                name: namespace,
              });
              moduleDeclaration.setDeclarationKind(
                ModuleDeclarationKind.Namespace
              );
              moduleDeclaration.setIsExported(true);
              const moduleDeclare = selfDeclare && globalDeclare;
              if (moduleDeclare) {
                moduleDeclaration.setHasDeclareKeyword(true);
              }
              genInterfaceOrAlias(data, {
                warnings: namespaceContext.warnings,
                errors: namespaceContext.errors,
                logger: itemLogger,
                rootDeclaration: moduleDeclaration,
                tsConfig: tsConfig!,
                namespace,
                selfDeclare: moduleDeclare,
                extractNamesMap,
                sourceFile,
                moduleName: name,
                identifiers,
                identifiersInfoMap,
              });
              namespaceContext.finished = true;
            } catch (e: any) {
              context[MODULE_SELF_KEY].errors.push({
                message: `items[${i}] error: ${e.stack || e.message}`,
              });
              hasError = true;
            }
          }),
          maxParallelLimit
        );
        logger.success("processed");
        if (hasError) {
          logger.error("have unknown error, file not emit");
        } else {
          logger.wait("file emitting");
          if (process.env.NODE_ENV !== "test") {
            await sourceFile.save();
          }
          logger.success("file emit success");
        }
        handleRemainingExtractNames(
          extractNamesMap,
          context[MODULE_SELF_KEY],
          ScopeEnum.module,
          (item) => {
            return `extractNames${getExtractNameChildPos(item)}->name(${
              item.originName
            }) not extract`;
          }
        );
      } else {
        context[MODULE_SELF_KEY].errors.push({
          message: "items is empty",
        });
      }
    }),
    config.parallelLimit,
    {
      throwInError: true,
    }
  );
  console.log("\n");
  console.log(colors.dim("wait for print tips..."));
  const diagnostics = project.getPreEmitDiagnostics();
  printTips(globalContext);
  console.log("\n");
  if (diagnostics.length) {
    console.log(project.formatDiagnosticsWithColorAndContext(diagnostics));
  } 
  return project;
}

import {
  ConfigOptions,
  Context,
  HttRequestConfig,
  CustomHttpRequestConfig,
  GlobalContext,
  ExtractNameItemWithDefined,
} from "./types";
import path from "path";
import fsp from "fs/promises";
import { getTsExtname, getTimestampFile, MODULE_SELF_KEY } from "./utils";
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
import handleExtractNames from "./handleExtractNames";

export default async function genCode(config: ConfigOptions) {
  const globalContext: GlobalContext = {};
  const project = new Project();
  const { default: fetch, AbortError } = await import("node-fetch");
  await Promise.allSettled(
    Object.keys(config.modules).map(async (name) => {
      const logger = createLogger({
        tag: name,
      });
      const m = config.modules[name];
      const {
        output,
        items,
        global: globalDeclare = true,
        namespaceExport = true,
        parallelLimit: maxParallelLimit = 3,
        hidden,
        extractNames: moduleExtractNames,
      } = m;
      if (hidden) {
        logger.warn(`module(${name}) has been hidden`);
        return;
      }
      const cwd = process.cwd();
      let outputPath = "";
      if (output) {
        outputPath = path.resolve(
          output.dir ? output.dir : cwd,
          output.filename ? output.filename : getTimestampFile(name)
        );
      } else {
        outputPath = path.resolve(cwd, getTimestampFile(name));
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
          outputPath = path.resolve(
            path.dirname(outputPath),
            getTimestampFile(
              path.basename(outputPath, getTsExtname(outputPath))
            )
          );
          logger.warn(`file ${colors.dim(outputPath)} will be generated`);
        }
      }
      logger.info("outputPath =>", outputPath);

      globalContext[name] = {
        [MODULE_SELF_KEY]: {
          errors: [],
          warnings: [],
        },
      };
      const context = globalContext[name];
      if (items.length) {
        const sourceFile = project.createSourceFile(outputPath, "", {
          overwrite: result.overwrite,
        });
        const moduleExtractNamesMap = new Map<string, ExtractNameItemWithDefined>();
        if (
          moduleExtractNames &&
          !handleExtractNames({
            extractNames: moduleExtractNames,
            extractNamesMap: moduleExtractNamesMap,
            rootName: "",
            context: context[MODULE_SELF_KEY],
            fieldPath: (i) => {
              return `extractNames->[${i}]->name`;
            },
            handleType: "module",
          })
        ) {
          return;
        }
        logger.wait("processing");
        const namespaceArr: string[] = [];
        await parallelLimit(
          items.map((item, i) => async () => {
            const {
              request,
              tsConfig,
              namespace,
              global: selfDeclare = true,
              selfExport = true,
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
                  timeout = 30000,
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
                    override,
                    content: JSON.stringify(data),
                    outputPath: sPath,
                  });
                }
              }
              itemLogger.success("get data finished");
              if (!isPlainData) {
                namespaceContext.errors.push({
                  message: "request returned data must be an plain object",
                });
                return;
              }
              const moduleDeclaration = sourceFile.addModule({
                name: namespace,
              });
              moduleDeclaration.setDeclarationKind(
                ModuleDeclarationKind.Namespace
              );
              if (selfExport && namespaceExport) {
                moduleDeclaration.setIsExported(true);
              }
              const moduleDeclare = selfDeclare && globalDeclare;
              if (moduleDeclare) {
                moduleDeclaration.setHasDeclareKeyword(true);
              }
              genInterfaceOrAlias(data, {
                warnings: namespaceContext.warnings,
                errors: namespaceContext.errors,
                logger: itemLogger,
                rootDeclaration: moduleDeclaration,
                tsConfig,
                namespace,
                selfDeclare: moduleDeclare,
                moduleExtractNamesMap,
                sourceFile,
              });
              namespaceContext.finished = true;
            } catch (e: any) {
              context[MODULE_SELF_KEY].errors.push({
                message: `items[${i}] error: ${e.message}`,
              });
            }
          }),
          maxParallelLimit
        );
        logger.success("processed");
        logger.wait("file emitting");
        await sourceFile.save();
        logger.success("file emit success");
      } else {
        context[MODULE_SELF_KEY].errors.push({
          message: "items is empty",
        });
      }
    })
  );
  console.log("\n");
  console.log(colors.dim("wait for print tips..."));
  const diagnostics = project.getPreEmitDiagnostics();
  printTips(globalContext);
  console.log("\n");
  if (diagnostics.length) {
    console.log(project.formatDiagnosticsWithColorAndContext(diagnostics));
  }
}

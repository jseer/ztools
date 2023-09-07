import {
  WriterFunction,
  Writers,
  TypeAliasDeclaration,
  InterfaceDeclaration,
} from "ts-morph";
import { GenContext, ExtractNameItemWithDefined } from "./types";
import colors from "picocolors";
import {
  ARRAY_ITEM_LINK_NAME,
  LINK_PATH_SEP,
  upperFirst,
  isFirstNumber,
  transformPropertyName,
  getTsTypeByValue,
  reg,
} from "./utils";
import handleExtractNames from "./handleExtractNames";

enum typeEnum {
  array = "array",
  object = "object",
  number = "number",
  undefined = "undefined",
  string = "string",
  boolean = "boolean",
  null = "null",
}

interface InfoMap {
  links: Set<string>;
  declaration: TypeAliasDeclaration | InterfaceDeclaration;
}

export default function genInterfaceOrAlias(data: any, context: GenContext) {
  context.logger.wait("processing");
  let {
    rootDeclaration,
    tsConfig: { rootName, extractNames },
    selfDeclare,
    sourceFile,
    moduleExtractNamesMap,
  } = context;
  rootName = upperFirst(rootName);
  const extractNamesMap = new Map<string, ExtractNameItemWithDefined>();
  if (
    extractNames &&
    !handleExtractNames({
      extractNames,
      extractNamesMap,
      rootName,
      context,
      fieldPath: (i) => {
        return `tsConfig->extractNames[${i}]->name`;
      },
      handleType: "namespace",
    })
  ) {
    return;
  }
  const identifiers = new Map<string, string>();
  const identifiersInfoMap = new Map<string, InfoMap>();
  const propertyQueue: string[] = [];

  function getLinkName() {
    return propertyQueue.join(LINK_PATH_SEP);
  }

  function getExtractNameItem(name: string) {
    const curLinkName = getLinkName();
    return extractNamesMap.get(curLinkName + LINK_PATH_SEP + name);
  }

  function getUniqueIdentifier(extractName: string, i: number = 1): string {
    const rewriteExtractName = extractName + i++;
    if (identifiersInfoMap.has(rewriteExtractName)) {
      return getUniqueIdentifier(extractName, i);
    }
    return rewriteExtractName;
  }

  function transformIdentifier(name: string) {
    let originName = name;
    name = name.trim();
    name = reg.test(name) ? name : name.replace(/\W/g, "");
    name = name.replace(/-([a-z])/, (_, $1: string) => {
      return $1 ? $1.toUpperCase() : $1;
    });
    name = isFirstNumber(Number(name[0])) ? name.replace(/^[0-9]+/, "") : name;
    if (name !== originName) {
      context.warnings.push({
        message: `identifier: ${colors.dim(
          originName
        )} is illegal, rewrite as ${colors.dim(name)}`,
      });
    }
    return upperFirst(name);
  }

  function getNameByExportItem(linkName: string) {
    const extractItem = extractNamesMap.get(linkName);
    if (extractItem) {
      if (extractItem.defined) {
        return extractItem.defined;
      }
      if (identifiersInfoMap.has(extractItem.name)) {
        extractItem.defined = getUniqueIdentifier(extractItem.name);
        context.warnings.push({
          message: `items->tsConfig->extractNames->name ${colors.dim(
            extractItem.name
          )} has been declared, rewrite as ${extractItem.defined}`,
        });
        return extractItem.defined;
      } else {
        extractItem.defined = extractItem.name;
        return extractItem.defined;
      }
    }
  }

  function getNameByExtractName() {
    let linkName = getLinkName();
    let name = linkName;
    let extractName = getNameByExportItem(linkName);
    name = extractName ? extractName : name;
    if (extractName) {
      return { name: extractName, linkName };
    }
    return { name: transformIdentifier(name), linkName };
  }

  function getAliasFromArrayWithExtractName(
    name: string,
    data: any,
    isExport?: boolean
  ) {
    const literal = getTypeFromArray(name, data);
    const result = addTypeAlias(name, literal, isExport);
    return result.aliasName;
  }
  function getTypeFromObject(name: string, data: any): WriterFunction {
    propertyQueue.push(name);
    const writerFunction = Writers.objectType({
      properties: Object.keys(data).map((key: string) => {
        let type: string | WriterFunction = getTsTypeByValue(data[key]);
        if (type === typeEnum.object) {
          const extractNameItem = getExtractNameItem(key);
          if (extractNameItem) {
            type = getInterfaceFromObject(
              key,
              data[key],
              extractNameItem.selfExport
            ).interfaceName;
          } else {
            type = getTypeFromObject(key, data[key]);
          }
        } else if (type === typeEnum.array) {
          const extractNameItem = getExtractNameItem(key);
          if (extractNameItem) {
            type = getAliasFromArrayWithExtractName(
              key,
              data[key],
              extractNameItem.selfExport
            );
          } else {
            type = getTypeFromArray(key, data[key]);
          }
        }
        return {
          name: transformPropertyName(key),
          type,
        };
      }),
    });
    propertyQueue.pop();
    return writerFunction;
  }

  function getTypeFromArray(key: string, arr: any[]) {
    propertyQueue.push(key);
    const fArr = arr.filter((item) => item !== null);
    const item = fArr[0];
    let result;
    if (item) {
      const type = getTsTypeByValue(item);
      if (type === typeEnum.array) {
        result =
          getAliasFromArrayWithExtractName(
            ARRAY_ITEM_LINK_NAME,
            item,
            getExtractNameItem(ARRAY_ITEM_LINK_NAME)?.selfExport
          ) + "[]";
      } else if (type === typeEnum.object) {
        result =
          getInterfaceFromObject(
            ARRAY_ITEM_LINK_NAME,
            item,
            getExtractNameItem(ARRAY_ITEM_LINK_NAME)?.selfExport
          ).interfaceName + "[]";
      } else {
        result = type + "[]";
      }
    } else {
      result = "any[]";
    }
    propertyQueue.pop();
    return result;
  }

  function setIdentifier(
    name: string,
    linkName: string,
    declaration: TypeAliasDeclaration | InterfaceDeclaration
  ) {
    identifiers.set(linkName, name);
    let infoMap: InfoMap;
    if (identifiersInfoMap.has(name)) {
      infoMap = identifiersInfoMap.get(name)!;
    } else {
      infoMap = {} as InfoMap;
      identifiersInfoMap.set(name, infoMap as InfoMap);
    }
    infoMap.declaration = declaration;
    if (!infoMap.links) {
      infoMap.links = new Set<string>();
    }
    infoMap.links.add(linkName);
  }

  function addTypeAlias(
    name: string,
    type: string | WriterFunction,
    isExport?: boolean
  ) {
    propertyQueue.push(name);
    const { name: aliasName, linkName } = getNameByExtractName();
    let result: {
      aliasName: string;
      aliasDeclaration: TypeAliasDeclaration;
      end?: boolean;
    };
    if (identifiersInfoMap.has(aliasName)) {
      result = {
        aliasDeclaration: identifiersInfoMap.get(aliasName)
          ?.declaration as TypeAliasDeclaration,
        aliasName,
        end: true,
      };
    } else {
      const aliasDeclaration = rootDeclaration.addTypeAlias({
        name: aliasName,
        type,
      });
      if (isExport && !selfDeclare) {
        aliasDeclaration.setIsExported(true);
      }
      result = { aliasDeclaration, aliasName };
    }
    propertyQueue.pop();
    setIdentifier(aliasName, linkName, result.aliasDeclaration!);
    return result;
  }
  function addInterface(isExport?: boolean) {
    const { name: interfaceName, linkName } = getNameByExtractName();
    let result: {
      interfaceName: string;
      interfaceDeclaration: InterfaceDeclaration;
      end?: boolean;
    };
    if (identifiersInfoMap.has(interfaceName)) {
      result = {
        interfaceDeclaration: identifiersInfoMap.get(interfaceName)
          ?.declaration as InterfaceDeclaration,
        interfaceName,
        end: true,
      };
    } else {
      const interfaceDeclaration = rootDeclaration.addInterface({
        name: interfaceName,
      });
      if (isExport && !selfDeclare) {
        interfaceDeclaration.setIsExported(true);
      }
      result = { interfaceDeclaration, interfaceName };
    }
    setIdentifier(interfaceName, linkName, result.interfaceDeclaration!);
    return result;
  }

  function getInterfaceFromObject(name: string, data: any, isExport?: boolean) {
    propertyQueue.push(name);
    const { interfaceDeclaration, interfaceName, end } = addInterface(isExport);
    if (!end) {
      for (let key in data) {
        const type = getTsTypeByValue(data[key]);
        if (type === typeEnum.array) {
          const extractNameItem = getExtractNameItem(key);
          if (extractNameItem) {
            interfaceDeclaration.addProperty({
              name: transformPropertyName(key),
              type: getAliasFromArrayWithExtractName(
                key,
                data[key],
                extractNameItem.selfExport
              ),
            });
            continue;
          }
          interfaceDeclaration.addProperty({
            name: transformPropertyName(key),
            type: getTypeFromArray(key, data[key]),
          });
          continue;
        }
        if (type === typeEnum.object) {
          const extractNameItem = getExtractNameItem(key);
          if (extractNameItem) {
            interfaceDeclaration.addProperty({
              name: transformPropertyName(key),
              type: getInterfaceFromObject(
                key,
                data[key],
                extractNameItem.selfExport
              ).interfaceName,
            });
            continue;
          }
          interfaceDeclaration.addProperty({
            name: transformPropertyName(key),
            type: getTypeFromObject(key, data[key]),
          });
          continue;
        }
        interfaceDeclaration.addProperty({
          type,
          name: transformPropertyName(key),
        });
      }
    }
    propertyQueue.pop();
    return { interfaceDeclaration, interfaceName };
  }

  function getAliasFromArray(
    rootName: string,
    data: any[],
    isExport?: boolean
  ) {
    return addTypeAlias(rootName, getTypeFromArray(rootName, data), isExport);
  }

  if (typeof data === "object") {
    getInterfaceFromObject(rootName, data, true);
  } else if (Array.isArray(data)) {
    getAliasFromArray(rootName, data, true);
  } else {
    context.warnings.push({
      message: `data not an object or array, missing`,
    });
  }
  context.logger.info("processed");
}

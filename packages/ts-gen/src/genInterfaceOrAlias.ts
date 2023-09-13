import {
  WriterFunction,
  Writers,
  TypeAliasDeclaration,
  InterfaceDeclaration,
} from "ts-morph";
import {
  DefineScope,
  ExtractNameItemWithDefined,
  GenContext,
  IdentifiersInfo,
  ScopeEnum,
} from "./types";
import colors from "picocolors";
import {
  ARRAY_ITEM_LINK_NAME,
  LINK_PATH_SEP,
  upperFirst,
  isFirstNumber,
  transformPropertyName,
  getTsTypeByValue,
  reg,
  proxyIdentifiersTarget,
  getExtractNameChildPos,
} from "./utils";
import handleExtractNames, {
  handleRemainingExtractNames,
} from "./handleExtractNames";

enum typeEnum {
  array = "array",
  object = "object",
  number = "number",
  undefined = "undefined",
  string = "string",
  boolean = "boolean",
  null = "null",
}

export default function genInterfaceOrAlias(data: any, context: GenContext) {
  context.logger.wait("processing");
  let {
    rootDeclaration,
    tsConfig: { rootName, extractNames },
    selfDeclare,
    sourceFile,
    moduleName,
    extractNamesMap: parentExtractNamesMap,
    identifiers: parentIdentifiers,
    identifiersInfoMap: parentIdentifiersInfoMap,
    namespace,
  } = context;
  rootName = upperFirst(rootName!);
  const extractNamesMap = new Map(parentExtractNamesMap.entries());
  if (
    extractNames &&
    !handleExtractNames({
      extractNames,
      extractNamesMap,
      rootName,
      context,
      fieldPath: (item) => {
        return `tsConfig->extractNames${getExtractNameChildPos(
          item
        )}->name`;
      },
      scope: ScopeEnum.namespace,
      moduleName,
      namespace,
    })
  ) {
    return;
  }
  const propertyQueue: string[] = [];
  propertyQueue.push(moduleName, namespace);
  let currentLinkName = propertyQueue.join(LINK_PATH_SEP);
  const defaultLinkName = getLinkName();
  const defineScope: DefineScope = {
    linkName: defaultLinkName,
    scope: ScopeEnum.namespace,
  };
  const extractNamesScopeQueue: { linkName: string; scope: ScopeEnum }[] = [
    { linkName: moduleName, scope: ScopeEnum.module },
    Object.assign({}, defineScope),
  ];
  const identifiers = proxyIdentifiersTarget<string>(
    new Map<string, string>(),
    {
      defineScope,
      parentIdentifiers,
    }
  );
  const identifiersInfoMap = proxyIdentifiersTarget<IdentifiersInfo>(
    new Map<string, IdentifiersInfo>(),
    {
      defineScope,
      parentIdentifiers: parentIdentifiersInfoMap,
    }
  );
  const scopeDeclaration = {
    [ScopeEnum.module]: sourceFile,
    [ScopeEnum.namespace]: rootDeclaration,
  };

  function getLinkName() {
    return propertyQueue.join(LINK_PATH_SEP);
  }

  function getLinkNameDefine() {
    if (defineScope.scope === ScopeEnum.namespace) {
      return propertyQueue.slice(2).join(LINK_PATH_SEP);
    } else if (defineScope.scope === ScopeEnum.module) {
      return propertyQueue.slice(1).join(LINK_PATH_SEP);
    } else {
      const name = getLinkName();
      context.errors.push({
        message: `never linkName(${name})`,
      });
      return name; // never;
    }
  }

  function getExtractNameItem(name: string) {
    return extractNamesMap.get(currentLinkName + LINK_PATH_SEP + name);
  }

  function getUniqueIdentifier(extractName: string, i: number = 1): string {
    const rewriteExtractName = extractName + i++;
    if (hasIdentifier(rewriteExtractName)) {
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

  function setDefineScope() {
    const last = extractNamesScopeQueue[extractNamesScopeQueue.length - 1];
    defineScope.linkName = last.linkName;
    defineScope.scope = last.scope;
  }

  function enter(name: string) {
    propertyQueue.push(name);
    currentLinkName = getLinkName();
    const extractNameItem = extractNamesMap.get(currentLinkName);
    if (extractNameItem) {
      extractNamesScopeQueue.push({
        linkName: currentLinkName,
        scope: extractNameItem.scope,
      });
      setDefineScope();
    }
  }

  function leave() {
    if (
      defineScope.linkName === currentLinkName &&
      extractNamesScopeQueue.length > 1
    ) {
      extractNamesScopeQueue.pop();
      setDefineScope();
    }
    propertyQueue.pop();
    currentLinkName = getLinkName();
  }

  function hasIdentifier(name: string) {
    return (
      (defineScope.scope === ScopeEnum.module &&
        parentIdentifiersInfoMap.has(name)) ||
      (defineScope.scope === ScopeEnum.namespace &&
        identifiersInfoMap.has(name))
    );
  }

  function getExportItem(linkName: string) {
    const extractItem = extractNamesMap.get(linkName);
    if (extractItem) {
      if (extractItem.defined) {
        return extractItem;
      } else if (hasIdentifier(extractItem.name)) {
        extractItem.defined = getUniqueIdentifier(extractItem.name);
        context.warnings.push({
          message: `tsConfig->extractNames->name(${extractItem.name}) has been declared, rewrite as ${extractItem.defined}`,
        });
        return extractItem;
      } else {
        extractItem.defined = extractItem.name;
        return extractItem;
      }
    }
  }

  function getPreScope() {
    return extractNamesScopeQueue[extractNamesScopeQueue.length - 2];
  }

  function getTypeWithNamespace(
    type: string,
    extractItem?: ExtractNameItemWithDefined
  ) {
    return getPreScope().scope === ScopeEnum.module &&
      extractItem &&
      extractItem.scope === ScopeEnum.namespace
      ? namespace + "." + type
      : type;
  }

  function getNameByExtractName() {
    let extractItem = getExportItem(currentLinkName);
    if (extractItem) {
      return {
        name: extractItem.defined!,
        linkName: currentLinkName,
        extractItem,
      };
    }
    return {
      name: transformIdentifier(getLinkNameDefine()),
      linkName: currentLinkName,
    };
  }

  function getAliasFromArray(name: string, data: any, isExport?: boolean) {
    enter(name);
    const literal = getLiteralFromArray(name, data);
    const { aliasDeclaration, aliasName, extractItem } = addTypeAlias(
      name,
      literal,
      isExport
    );
    const result = {
      aliasDeclaration,
      aliasName: getTypeWithNamespace(aliasName, extractItem),
    };
    leave();
    return result;
  }

  function getAliasFromNormal(name: string, type: string, isExport?: boolean) {
    enter(name);
    const { aliasDeclaration, aliasName, extractItem } = addTypeAlias(
      name,
      type,
      isExport
    );
    const result = {
      aliasDeclaration,
      aliasName: getTypeWithNamespace(aliasName, extractItem),
    };
    leave();
    return result;
  }

  function getTypeFromObject(name: string, data: any): WriterFunction {
    enter(name);
    const writerFunction = Writers.objectType({
      properties: Object.keys(data).map((key: string) => {
        let type: string | WriterFunction = getTsTypeByValue(data[key]);
        const extractNameItem = getExtractNameItem(key);
        if (type === typeEnum.object) {
          if (extractNameItem) {
            type = getInterfaceFromObject(key, data[key]).interfaceName;
          } else {
            type = getTypeFromObject(key, data[key]);
          }
        } else if (type === typeEnum.array) {
          if (extractNameItem) {
            type = getAliasFromArray(key, data[key]).aliasName;
          } else {
            type = getTypeFromArray(key, data[key]);
          }
        } else {
          if (extractNameItem) {
            type = getAliasFromNormal(key, type).aliasName;
          }
        }

        return {
          name: transformPropertyName(key),
          type,
        };
      }),
    });
    leave();
    return writerFunction;
  }

  function getLiteralFromArray(key: string, arr: any[]) {
    const fArr = arr.filter((item) => item !== null);
    const item = fArr[0];
    let result = "[]";
    if (item) {
      const type = getTsTypeByValue(item);
      if (type === typeEnum.array) {
        if (getExtractNameItem(ARRAY_ITEM_LINK_NAME)) {
          result = getAliasFromArray(ARRAY_ITEM_LINK_NAME, item) + "[]";
        } else {
          result = getTypeFromArray(ARRAY_ITEM_LINK_NAME, item) + "[]";
        }
      } else if (type === typeEnum.object) {
        result =
          getInterfaceFromObject(ARRAY_ITEM_LINK_NAME, item).interfaceName +
          "[]";
      } else {
        if (getExtractNameItem(ARRAY_ITEM_LINK_NAME)) {
          return (
            getAliasFromNormal(ARRAY_ITEM_LINK_NAME, type).aliasName + "[]"
          );
        } else {
          result = type + "[]";
        }
      }
    }
    return result;
  }

  function getTypeFromArray(key: string, arr: any[]) {
    enter(key);
    const result = getLiteralFromArray(key, arr);
    leave();
    return result;
  }

  function setIdentifier(
    name: string,
    linkName: string,
    declaration: TypeAliasDeclaration | InterfaceDeclaration
  ) {
    identifiers.set(linkName, name);
    let infoMap: IdentifiersInfo;
    if (identifiersInfoMap.has(name)) {
      infoMap = identifiersInfoMap.get(name)!;
    } else {
      infoMap = {} as IdentifiersInfo;
      identifiersInfoMap.set(name, infoMap);
    }
    infoMap.declaration = declaration;
    if (!infoMap.links) {
      infoMap.links = new Set<string>();
    }
    infoMap.links.add(linkName);
  }

  function addTypeAlias(name: string, literal: string, isExport?: boolean) {
    const { name: aliasName, linkName, extractItem } = getNameByExtractName();
    let result: {
      aliasName: string;
      aliasDeclaration: TypeAliasDeclaration;
      end?: boolean;
      extractItem?: ExtractNameItemWithDefined;
    };
    const identifierInfoItem = identifiersInfoMap.get(aliasName);
    if (identifierInfoItem) {
      result = {
        aliasDeclaration:
          identifierInfoItem.declaration as TypeAliasDeclaration,
        aliasName,
        end: true,
        extractItem,
      };
    } else {
      const aliasDeclaration = scopeDeclaration[defineScope.scope].addTypeAlias(
        {
          name: aliasName,
          type: literal,
        }
      );
      if (isExport || extractItem) {
        aliasDeclaration.setIsExported(true);
      }
      result = { aliasDeclaration, aliasName, extractItem };
    }
    setIdentifier(aliasName, linkName, result.aliasDeclaration);
    return result;
  }

  function addInterface(isExport?: boolean) {
    const {
      name: interfaceName,
      linkName,
      extractItem,
    } = getNameByExtractName();
    let result: {
      interfaceName: string;
      interfaceDeclaration: InterfaceDeclaration;
      end?: boolean;
      extractItem?: ExtractNameItemWithDefined;
    };
    const identifierInfoItem = identifiersInfoMap.get(interfaceName);
    if (identifierInfoItem) {
      result = {
        interfaceDeclaration:
          identifierInfoItem.declaration as InterfaceDeclaration,
        interfaceName,
        end: true,
        extractItem,
      };
    } else {
      const interfaceDeclaration = scopeDeclaration[
        defineScope.scope
      ].addInterface({
        name: interfaceName,
      });
      if (isExport || extractItem) {
        interfaceDeclaration.setIsExported(true);
      }
      result = { interfaceDeclaration, interfaceName, extractItem };
    }
    setIdentifier(interfaceName, linkName, result.interfaceDeclaration);
    return result;
  }

  function getInterfaceFromObject(name: string, data: any, isExport?: boolean) {
    enter(name);
    const { interfaceDeclaration, interfaceName, end, extractItem } =
      addInterface(isExport);
    if (!end) {
      for (let key in data) {
        const type = getTsTypeByValue(data[key]);
        if (type === typeEnum.array) {
          const extractNameItem = getExtractNameItem(key);
          if (extractNameItem) {
            interfaceDeclaration.addProperty({
              name: transformPropertyName(key),
              type: getAliasFromArray(key, data[key]).aliasName,
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
              type: getInterfaceFromObject(key, data[key]).interfaceName,
            });
            continue;
          }
          interfaceDeclaration.addProperty({
            name: transformPropertyName(key),
            type: getTypeFromObject(key, data[key]),
          });
          continue;
        }
        const extractNameItem = getExtractNameItem(key);
        if (extractNameItem) {
          interfaceDeclaration.addProperty({
            name: transformPropertyName(key),
            type: getAliasFromNormal(key, type).aliasName,
          });
        } else {
          interfaceDeclaration.addProperty({
            type,
            name: transformPropertyName(key),
          });
        }
      }
    }
    const result = {
      interfaceDeclaration,
      interfaceName: getTypeWithNamespace(interfaceName, extractItem),
    };
    leave();
    return result;
  }

  const type = getTsTypeByValue(data);
  if (type === typeEnum.object) {
    getInterfaceFromObject(rootName, data, true);
  } else if (type === typeEnum.array) {
    getAliasFromArray(rootName, data, true);
  } else {
    getAliasFromNormal(rootName, data, true);
  }
  handleRemainingExtractNames(
    extractNamesMap,
    context,
    ScopeEnum.namespace,
    (item) => {
      return `tsConfig->extractNames${getExtractNameChildPos(item)}->name(${
        item.originName
      }) not extract`;
    }
  );
  context.logger.info("processed");
}

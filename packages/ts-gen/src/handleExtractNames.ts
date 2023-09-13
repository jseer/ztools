import {
  SingleLinkPath,
  ExtractNameItemWithDefined,
  ExtractNames,
  Context,
  ScopeEnum,
} from "./types";
import {
  LINK_PATH_SEP,
  upperFirst,
  reg,
  getExtractNameChildPos,
} from "./utils";

interface Options {
  extractNames: ExtractNames;
  extractNamesMap: Map<string, ExtractNameItemWithDefined>;
  context: Context;
  fieldPath(item: ExtractNameItemWithDefined): string;
  scope: ExtractNameItemWithDefined["scope"];
  moduleName: string;
  namespace?: string;
  rootName?: string;
}

export default function handleExtractNames({
  extractNames,
  extractNamesMap,
  rootName,
  context,
  fieldPath,
  scope = ScopeEnum.namespace,
  moduleName,
  namespace,
}: Options) {
  const isNamespace = scope === ScopeEnum.namespace;
  const isModule = scope === ScopeEnum.module;
  const extractNamesMapByName = new Map<string, ExtractNameItemWithDefined>();
  let currentExtractNamesGroupMap: Map<string, SingleLinkPath>;
  function getLinkPath(
    prefixs: SingleLinkPath,
    linkPath: SingleLinkPath,
    item: ExtractNameItemWithDefined,
    parent?: ExtractNameItemWithDefined
  ):
    | {
        full: string;
        self: string;
        fullPaths: SingleLinkPath;
        selfPaths: SingleLinkPath;
      }
    | false {
    if (!parent && isModule) {
      if (!linkPath[1]) {
        context.warnings.push({
          message: `do you want to extract namespace(${
            linkPath[0]
          }), it will be prevent, so ${fieldPath(
            item
          )} linkPath(${linkPath.join(LINK_PATH_SEP)}) at least two element`,
        });
        return false;
      }
      if (/^[a-z]/.test(linkPath[1])) {
        linkPath = [linkPath[0], upperFirst(linkPath[1])].concat(
          linkPath.slice(2)
        );
      }
    }
    const selfPath = linkPath.join(LINK_PATH_SEP);
    const fullPaths = [...prefixs, ...linkPath];
    return {
      full: fullPaths.join(LINK_PATH_SEP),
      self: selfPath,
      fullPaths,
      selfPaths: linkPath,
    };
  }
  function setLinkPathInfo(
    linkPath: string,
    item: ExtractNameItemWithDefined,
    selfLinkPath: string,
    fullPaths: SingleLinkPath,
    selfPaths: SingleLinkPath,
    index: number
  ) {
    const extractNameItem = extractNamesMap.get(linkPath);
    if (extractNameItem) {
      context.warnings.push({
        message: `extractNames${getExtractNameChildPos(
          item
        )}->linkPath(${selfLinkPath}) has been set, conflicts with scope:${
          ScopeEnum[extractNameItem.scope]
        } index:extractNames${getExtractNameChildPos(
          extractNameItem
        )}, do not repeat to set`,
      });
      return;
    }
    if (validateSimilarExtractPath(linkPath, fullPaths, item, index)) {
      item.fullLinkPaths.set(linkPath, {
        index,
        fullPaths: fullPaths,
        selfPaths,
      });
      currentExtractNamesGroupMap.set(linkPath, fullPaths);
      extractNamesMap.set(linkPath, item);
    }
  }

  function validateSimilarExtractPath(
    linkPath: string,
    fullPaths: SingleLinkPath,
    item: ExtractNameItemWithDefined,
    index: number
  ) {
    const keysArr = Array.from(extractNamesMap.keys()).sort(
      (a, b) => a.length - b.length
    );
    let i = -1;
    while (++i < keysArr.length) {
      const key = keysArr[i];
      const value = extractNamesMap.get(key)!;
      if (value.scope === ScopeEnum.namespace) return true;
      const currentValue = currentExtractNamesGroupMap.get(key);
      if (
        linkPath.startsWith(key) &&
        (!currentValue || !validateEveryOne(fullPaths, currentValue))
      ) {
        const targetItem = value.fullLinkPaths.get(key)!;
        if (validateEveryOne(fullPaths, targetItem.fullPaths)) {
          context.warnings.push({
            message: `extractNames${getExtractNameChildPos(
              item
            )}->linkPath[${index}] the path has already been declared in scope:${
              ScopeEnum[value.scope]
            } index:extractNames${getExtractNameChildPos(value)}->linkPath[${
              targetItem.index
            }], you should declared in children field`,
          });
          return false;
        }
      }
    }
    return true;
  }

  function setLinkPathInfoFromItem(
    prefix: SingleLinkPath,
    newItem: ExtractNameItemWithDefined,
    index: number,
    parent?: ExtractNameItemWithDefined
  ) {
    const l = getLinkPath(
      prefix,
      (newItem.multi
        ? newItem.linkPath[index]
        : newItem.linkPath) as SingleLinkPath,
      newItem,
      parent
    );
    if (l) {
      setLinkPathInfo(l.full, newItem, l.self, l.fullPaths, l.selfPaths, index);
    }
  }

  function loopExtractNames(
    extractNames: ExtractNames,
    parent?: ExtractNameItemWithDefined
  ): boolean {
    let i = -1;
    while (++i < extractNames.length) {
      if (!parent) {
        currentExtractNamesGroupMap = new Map();
      }
      const item = extractNames[i];
      const newItem: ExtractNameItemWithDefined = {
        ...item,
        scope,
        originName: item.name,
        pos: parent ? [...parent.pos, i] : [i],
        fullLinkPaths: new Map(),
      };
      if (!reg.test(item.name)) {
        context.errors.push({
          message: `${fieldPath(newItem)} must be legal`,
        });
        return false;
      }
      const extractNameItem = extractNamesMapByName.get(item.name);
      if (extractNameItem) {
        context.errors.push({
          message: `${fieldPath(
            newItem
          )} has same name, conflicts with ${fieldPath(extractNameItem)}`,
        });
        return false;
      }
      newItem.name = upperFirst(item.name);
      newItem.multi = (item.linkPath as []).some((l) => Array.isArray(l));
      let j = -1;
      const prefixList = parent
        ? Array.from(parent.fullLinkPaths.values()).map((f) => f.fullPaths)
        : isNamespace
        ? [[moduleName, namespace, rootName]]
        : [[moduleName]];
      while (++j < prefixList.length) {
        const prefix = prefixList[j] as SingleLinkPath;
        if (newItem.multi) {
          let k = -1;
          while (++k < item.linkPath.length) {
            setLinkPathInfoFromItem(prefix, newItem, k, parent);
          }
        } else {
          setLinkPathInfoFromItem(prefix, newItem, 0, parent);
        }
      }
      extractNamesMapByName.set(item.name, newItem);
      if (newItem.children) {
        return loopExtractNames(newItem.children, newItem);
      }
    }

    return true;
  }
  return loopExtractNames(extractNames);
}

export function handleRemainingExtractNames(
  extractNamesMap: Map<string, ExtractNameItemWithDefined>,
  context: Context,
  scope: ScopeEnum,
  handleMessage: (item: ExtractNameItemWithDefined) => string
) {
  extractNamesMap.forEach((item) => {
    if (!item.defined && scope === item.scope) {
      context.warnings.push({
        message: handleMessage(item),
      });
    }
  });
}

function validateEveryOne(source: SingleLinkPath, target: SingleLinkPath) {
  let i = -1;
  while (++i < target.length) {
    if (target[i] === source[i]) {
      continue;
    } else {
      return false;
    }
  }
  return true;
}

import { getProgressiveFile } from "@ztools/utils";
import {
  ExtractNameItemWithDefined,
  ProxyIdentifiersContext,
  ScopeEnum,
} from "./types";

export const ARRAY_ITEM_LINK_NAME = "1";
export const LINK_PATH_SEP = "_";
export const DEFAULT_FILE_EXT = ".types.ts";
export const MODULE_SELF_KEY = "__%__SELF__%__";
export const CONFIG_FILES = [
  ".ts-genrc.ts",
  ".ts-genrc.js",
  ".ts-gen.config.ts",
  ".ts-gen.config.js",
];
export const DEFAULT_ROOT_NAME = "ResDTO";

export const getFile = (filePath: string) => {
  return getProgressiveFile(filePath, [".types.ts", ".d.ts"]);
};

export const getDefaultFilename = (name: string) => {
  return name + DEFAULT_FILE_EXT;
};

export function getTsTypeByValue(value: any) {
  return Object.prototype.toString
    .call(value)
    .match(/^\[object ([A-Z][a-z]+)]$/)![1]
    .toLowerCase();
}

export function upperFirst(name: string) {
  return name[0].toUpperCase() + name.slice(1);
}
export function isFirstNumber(first: number) {
  return first >= 0 && first <= 9;
}

export const reg = /^\w+$/;

export function transformPropertyName(name: string) {
  return isFirstNumber(Number(name[0])) || !reg.test(name) ? `"${name}"` : name;
}

export function proxyIdentifiersTarget<T>(
  identifiersTarget: Map<string, T>,
  {
    defineScope,
    parentIdentifiers,
  }: ProxyIdentifiersContext & {
    parentIdentifiers: Map<string, T>;
  }
) {
  const target = {
    get(key: string) {
      if (defineScope.scope === ScopeEnum.module) {
        return parentIdentifiers.get(key);
      } else if (defineScope.scope === ScopeEnum.namespace) {
        return identifiersTarget.get(key);
      }
    },
    set(key: string, value: any) {
      if (defineScope.scope === ScopeEnum.module) {
        parentIdentifiers.set(key, value);
      } else if (defineScope.scope === ScopeEnum.namespace) {
        identifiersTarget.set(key, value);
      }
    },
    has(key: string) {
      if (defineScope.scope === ScopeEnum.module) {
        return parentIdentifiers.has(key);
      } else if (defineScope.scope === ScopeEnum.namespace) {
        return identifiersTarget.has(key);
      }
    },
  };
  return new Proxy(identifiersTarget, {
    get(t, k, r) {
      return Reflect.get(target, k, r);
    },
    set(t, k, v, r) {
      return Reflect.set(target, k, v, r);
    },
    has(t, k) {
      return Reflect.has(target, k);
    },
  });
}

export function getExtractNameChildPos(item: ExtractNameItemWithDefined) {
  let i = -1;
  let str = "";
  while (++i < item.pos.length) {
    str += `${i === 0 ? "" : "children"}->${item.pos[i]}${
      i === item.pos.length - 1 ? "" : "->"
    }`;
  }
  return str;
}

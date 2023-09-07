import path from "path";
import { getTimestampFilename } from "@ztools/utils";

export const ARRAY_ITEM_LINK_NAME = "1";
export const LINK_PATH_SEP = "_";
export const DEFAULT_FILE_EXT = ".types.ts";
export const MODULE_SELF_KEY = "__%__SELF__%__";

export const getTimestampFile = (fileName: string = "") => {
  return getTimestampFilename(fileName, DEFAULT_FILE_EXT);
};

export const getTsExtname = (fileName: string) => {
  const basename = path.basename(fileName);
  return basename.endsWith(DEFAULT_FILE_EXT)
    ? DEFAULT_FILE_EXT
    : basename.endsWith(".d.ts")
    ? ".d.ts"
    : path.extname(fileName);
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
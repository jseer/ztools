import {
  ExtractNameItem,
  MultiLinkPath,
  SingleLinkPath,
  ExtractNameItemWithDefined,
  ExtractNames,
  Context,
} from "./types";
import { LINK_PATH_SEP, upperFirst, reg } from "./utils";

interface Options {
  extractNames: ExtractNames;
  extractNamesMap: Map<string, ExtractNameItemWithDefined>;
  rootName: string;
  context: Context;
  fieldPath(i: number): string;
  handleType: "namespace" | "module";
}
export default function handleExtractNames({
  extractNames,
  extractNamesMap,
  rootName,
  context,
  fieldPath,
  handleType = "namespace",
}: Options) {
  const isNamespace = handleType === "namespace";
  // const isModule = handleType === "module";
  function getLinkPath(linkPath: SingleLinkPath): string {
    if (isNamespace) {
      return (
        rootName +
        LINK_PATH_SEP +
        (Array.isArray(linkPath) ? linkPath.join(LINK_PATH_SEP) : linkPath)
      );
    } else {
      if (Array.isArray(linkPath) && /^[a-z]/.test(linkPath[1])) {
        linkPath = [linkPath[0], upperFirst(linkPath[1])].concat(
          linkPath.slice(2)
        );
      }
      return Array.isArray(linkPath) ? linkPath.join(LINK_PATH_SEP) : linkPath;
    }
  }
  function setLinkPathInfo(linkPath: string, item: ExtractNameItem) {
    extractNamesMap.set(linkPath, {
      selfExport: true,
      ...item,
      name: upperFirst(item.name),
      linkPath,
    });
  }
  const extractNamesArr: string[] = [];
  let i = -1;
  while (++i < extractNames.length) {
    const item = extractNames[i];
    if (!reg.test(item.name)) {
      context.errors.push({
        message: `${fieldPath(i)} must be legal`,
      });
      return;
    }
    const itemIndex = extractNamesArr.indexOf(item.name);
    if (itemIndex !== -1) {
      context.errors.push({
        message: `${fieldPath(i)} has same name, conflicts with ${fieldPath(
          itemIndex
        )}`,
      });
      return;
    }
    extractNamesArr.push(item.name);
    const multi = (item.linkPath as []).some((l) => Array.isArray(l));
    if (multi) {
      (item.linkPath as MultiLinkPath).forEach((l) => {
        setLinkPathInfo(getLinkPath(l), item);
      });
    } else {
      setLinkPathInfo(getLinkPath(item.linkPath as SingleLinkPath), item);
    }
  }
  return true;
}

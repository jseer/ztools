import { GlobalContext } from "./types";
import colors from "picocolors";
import { MODULE_SELF_KEY } from "./utils";

function getMessage(index: number, message: string) {
  return index + 1 + "." + message;
}
export default function printTips(globalContext: GlobalContext) {
  Object.keys(globalContext).forEach((contextKKey) => {
    console.log(colors.cyan(contextKKey + ":"));
    const padding1 = " ".repeat(Math.min(6, contextKKey.length));
    Object.keys(globalContext[contextKKey]).forEach((key) => {
      const padding2 = " ".repeat(Math.min(6, key.length));
      const { warnings, errors, finished } = globalContext[contextKKey][key];
      if (key === MODULE_SELF_KEY) {
        warnings.forEach((item, index) => {
          console.log(
            padding1 + colors.yellow(getMessage(index, item.message))
          );
        });
        errors.forEach((item, index) => {
          console.log(
            padding1 +
              colors.red(getMessage(index + warnings.length, item.message))
          );
        });
      } else {
        console.log(
          padding1 +
            colors.magenta(colors.bold(key)) +
            ": " +
            (finished && !errors.length
              ? colors.green("success")
              : colors.red("error"))
        );
        warnings.forEach((item, index) => {
          console.log(
            padding1 + padding2 + colors.yellow(getMessage(index, item.message))
          );
        });
        errors.forEach((item, index) => {
          console.log(
            padding1 +
              padding2 +
              colors.red(getMessage(index + warnings.length, item.message))
          );
        });
      }
    });
  });
}

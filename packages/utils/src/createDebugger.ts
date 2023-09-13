import debug from "debug";

const createDebugger = (context: string) => {
  return debug(context);
};

export default createDebugger;

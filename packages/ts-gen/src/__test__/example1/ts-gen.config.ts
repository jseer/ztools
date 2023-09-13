import defineConfig from "../../defineConfig";
import { getTimestampFilename } from "@ztools/utils";

import path from "path";

export default defineConfig(() => {
  return {
    modules: {
      carDetail: {
        output: {
          dir: path.resolve(__dirname),
          path: getTimestampFilename('carDetail'),
        },
        items: [
          {
            namespace: "example1",
            request: {
              fromFile: "data.json",
            },
          },
        ],
      },
    },
  };
});

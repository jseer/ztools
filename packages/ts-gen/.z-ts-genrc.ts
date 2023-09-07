import defineConfig from "./src/defineConfig";
import path from "path";

export default defineConfig({
  modules: {
    carDetail: {
      output: {
        dir: path.resolve("a"),
        filename: "a.ts",
      },
      parallelLimit: 4,
      extractNames: [
        {
          linkPath: [
            ["api1", "out", "b"],
            ["api2", "out", "a"],
          ],
          name: "relation",
          selfExport: false,
        },
      ],
      items: [
        {
          namespace: "api1",
          request: {
            fromFile: "data.json",
          },
          tsConfig: {
            rootName: "out",
          },
        },
        {
          namespace: "api2",
          global: false,
          request: {
            fromFile: "data2.json",
          },
          tsConfig: {
            rootName: "out",
            extractNames: [{
              linkPath: ['a'],
              name: 'aaa',
            },
            {
              linkPath: ['a'],
              name: 'aaa',
            }]
          },
        },
      ],
    },
  },
});

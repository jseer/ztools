import defineConfig from "{{{defineConfigPath}}}";
import path from "path";

export default defineConfig((options) => {
  const { DEFAULT_ROOT_NAME } = options;
  return {
    modules: {
      carDetail: {
        output: {
          dir: path.resolve("a"),
        },
        parallelLimit: 4,
        extractNames: [
          {
            linkPath: [
              ["api1", DEFAULT_ROOT_NAME, "a"],
              ["api2", DEFAULT_ROOT_NAME, "b"],
            ],
            // children: [
            //   {
            //     linkPath: [
            //       ['a1', '1'],
            //     ],
            //     name: 'CarItem'
            //   },
            // ],
            name: "Car",
          },
          // {
          //   linkPath: [
          //     ["api1", DEFAULT_ROOT_NAME, 'a'],
          //   ],
          //   name: 'a'
          // }
        ],
        items: [
          {
            namespace: "api1",
            request: {
              fromFile: "data.json",
            },
            tsConfig: {
              extractNames: [
                {
                  linkPath: [["a"]],
                  name: "a",
                  children: [
                    {
                      linkPath: ["b"],
                      name: "b",
                    },
                  ],
                },
              ],
            },
          },
          {
            namespace: "api2",
            global: false,
            request: {
              fromFile: "data2.json",
            },
            tsConfig: {
              extractNames: [],
            },
          },
        ],
      },
    },
  };
});

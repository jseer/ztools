import path from "path";
import handler from "../../handler";

test("example1", async () => {
  const project = await handler({ config: path.resolve(__dirname, 'ts-gen.config.ts')});
  const sourceFile =  project.getSourceFile(path.resolve(__dirname, 'carDetail/*.ts'))
  console.log(sourceFile,'sourceFile')
});

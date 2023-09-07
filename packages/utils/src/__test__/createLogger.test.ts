import createLogger from "../createLogger";

test("process.env.LOGGER_LEVEL", () => {
  process.env.LOGGER_LEVEL = "test";
  expect(() => createLogger()).toThrow(/^Invalid process.env.LOGGER_LEVEL/);
});

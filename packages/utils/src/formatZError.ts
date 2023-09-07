import { ZodError } from "zod";

export default function formatZError(error: ZodError) {
  const errors = error.errors;
  let str = "";
  errors.forEach((err, index) => {
    str +=
      err.path.join("->") +
      " " +
      err.message +
      (index === errors.length - 1 ? "" : "\n");
  });
  return str;
}

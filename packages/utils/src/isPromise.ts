export default function isPromiseLike(val: any) {
  return (
    typeof val === "object" &&
    typeof val !== null &&
    typeof val.then === "function"
  );
}

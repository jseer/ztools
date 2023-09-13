export default function getTimestampFilename(
  fileName: string = "",
  ext: string = ""
) {
  return `${
    fileName ? fileName + "-" : ""
  }timestamp-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`;
}

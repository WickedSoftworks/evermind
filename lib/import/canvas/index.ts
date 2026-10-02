import { parseCourseDataJs } from "./parse-js";
import { parseCanvasJson } from "./parse-json";
import { parseCanvasXml, type XmlReader } from "./parse-xml";
import { fail, type ParseResult } from "./types";

export { plainDescription } from "./description";
export { AssignmentCollector, canvasPriority } from "./normalise";
export { parseCourseDataJs } from "./parse-js";
export { parseCanvasJson } from "./parse-json";
export { parseCanvasXml } from "./parse-xml";
export {
  type CanvasItem,
  describeParseFailure,
  type ParsedAssignment,
  type ParseFailure,
  type ParseResult,
} from "./types";

/** Extensions the picker accepts. The `accept` attribute and the label prose both read from this. */
export const ACCEPTED_EXTENSIONS = [".js", ".json", ".xml"] as const;

/**
 * Picks a parser by file extension and runs it.
 *
 * By extension rather than by sniffing the content, because the three formats
 * are unambiguous from their names and Canvas produces them under fixed ones.
 *
 * An unrecognised extension is a *failure*, not an empty result. Dropping
 * through with nothing — which is what the old chain of `if`s did, having no
 * final `else` — meant a student who exported a CSV was told "no assignments
 * found in file" and had no way to tell whether the problem was the app or their
 * export.
 */
export function detectAndParse(fileName: string, text: string, read?: XmlReader): ParseResult {
  const extension = extensionOf(fileName);

  switch (extension) {
    case ".json":
      return parseCanvasJson(text);
    case ".js":
      return parseCourseDataJs(text);
    case ".xml":
      return parseCanvasXml(text, read);
    default:
      return fail({ kind: "unsupported-format", extension: extension || "these" });
  }
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

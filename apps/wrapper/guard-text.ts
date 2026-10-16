// Text helpers of the test-only-entry guard: the forms in which a path can be
// written in a file that Vite later reads as a path. The guard tests every form
// and the raw text.

/**
 * The named HTML character references whose expansion can spell part of a path:
 * every reference of the HTML standard (entities.json, 2,231 of them) whose
 * expansion is made only of ASCII letters and digits and of `/ \ . % : ? # & _ -
 * ~` and tab or newline. Sixteen qualify; the test compares this table with the
 * list taken from the standard (src/fixtures/html-path-entities.json). The
 * legacy forms without a semicolon are `amp` and `AMP` only.
 */
export const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  AMP: "&",
  NewLine: "\n",
  Tab: "\t",
  UnderBar: "_",
  amp: "&",
  bsol: "\\",
  colon: ":",
  fjlig: "fj",
  lowbar: "_",
  num: "#",
  percnt: "%",
  period: ".",
  quest: "?",
  sol: "/",
};
const LEGACY_WITHOUT_SEMICOLON: ReadonlySet<string> = new Set(["amp", "AMP"]);

const MAX_CODE_POINT = 0x10_ffff;

/**
 * A numeric character reference's value; leading zeros are free, the value is
 * capped.
 */
const numericValue = (digits: string, radix: 10 | 16): number | undefined => {
  const significant = digits.replace(/^0+/u, "") || "0";
  if (significant.length > (radix === 10 ? 7 : 6)) return undefined;
  const value = Number.parseInt(significant, radix);
  return value > MAX_CODE_POINT ? undefined : value;
};

/**
 * Decode the HTML character references that can spell a path: decimal and hex
 * numeric ones (any number of leading zeros, with or without the closing
 * semicolon, which the HTML parser accepts) and the named ones above. An
 * unknown name or an out-of-range value is left as written.
 */
export const decodeEntities = (text: string): string =>
  text.replaceAll(
    /&(?:#(\d+);?|#[xX]([\da-fA-F]+);?|([a-zA-Z][a-zA-Z\d]*)(;?))/gu,
    (match, decimal, hex, name, semicolon) => {
      if (decimal !== undefined || hex !== undefined) {
        const value =
          decimal === undefined
            ? numericValue(hex, 16)
            : numericValue(decimal, 10);
        return value === undefined ? match : String.fromCodePoint(value);
      }
      const expansion = NAMED_ENTITIES[name];
      if (expansion === undefined) return match;
      return semicolon === ";" || LEGACY_WITHOUT_SEMICOLON.has(name)
        ? expansion
        : match;
    },
  );

/**
 * Decode every valid `%XX` sequence on its own, so a stray `%` (`100%`) never
 * hides a path elsewhere in the text, and a malformed sequence stays as
 * written, as it does for the URL parser.
 */
export const decodePercent = (text: string): string =>
  text.replaceAll(/%([\da-fA-F]{2})/gu, (_match, hex) =>
    String.fromCodePoint(Number.parseInt(hex, 16)),
  );

/** Collapse `\\`, `//`, `/./`, and `x/..` so a spelled-out path is comparable. */
export const normalizePath = (text: string): string => {
  const parts: string[] = [];
  for (const part of text.replaceAll("\\", "/").split("/")) {
    if (part === "..") {
      if (parts.length > 0 && parts.at(-1) !== "..") parts.pop();
      else parts.push(part);
    } else if (part !== "" && part !== ".") parts.push(part);
  }
  return parts.join("/");
};

/**
 * Every form of a non-script file's text a path could be read from: as written,
 * with character references decoded (HTML), with percent-sequences decoded (CSS
 * `url()`, HTML attributes), and with both (an entity first, as a browser
 * does), each also normalized.
 */
export const textForms = (text: string): string[] => {
  const entities = decodeEntities(text);
  const forms = [text, entities, decodePercent(text), decodePercent(entities)];
  return [...forms, ...forms.map(form => normalizePath(form))];
};

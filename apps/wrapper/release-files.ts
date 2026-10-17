// What the release integrity step and its output check share: the file names,
// SHA-256 in hex and base64, and the reading of the page's tags.

export const HEADERS_FILE = "headers.json";
export const MANIFEST_FILE = "integrity-manifest.json";
export const PAGE = "index.html";

export const digest = async (bytes: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
  );

export const hex = (bytes: Uint8Array): string =>
  [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");

export const base64 = (bytes: Uint8Array): string =>
  btoa(String.fromCodePoint(...bytes));

export const TAG = /<(script|link|style)\b([^>]*)>/giu;
export const ATTRIBUTE =
  /\s([a-z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/giu;
export const INLINE_HANDLER = /\son[a-z]+\s*=/iu;
export const STYLE_ATTRIBUTE = /\sstyle\s*=/iu;

export const attributesOf = (text: string): Map<string, string> => {
  const attributes = new Map<string, string>();
  for (const match of text.matchAll(ATTRIBUTE)) {
    const name = match[1]?.toLowerCase();
    if (name !== undefined) {
      attributes.set(name, match[2] ?? match[3] ?? match[4] ?? "");
    }
  }
  return attributes;
};

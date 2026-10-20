// The Subresource Integrity step for one built page, shared by the Wrapper's
// page and the verify page (specs/client-kit.md, How the Wrapper reaches the
// SuperEngine origin; specs/verify-page.md, V-16): every `<script src>` and
// `<link href>` gets an `integrity="sha256-..."` of the file it loads, and a
// page that the strict policy would have to be loosened for is refused.

import {
  attributesOf,
  base64,
  digest,
  INLINE_HANDLER,
  STYLE_ATTRIBUTE,
  TAG,
} from "./release-files.ts";

/** The bytes of a file the page names, by path relative to the base, if any. */
export type FileLookup = (file: string) => Uint8Array | undefined;

const refuse = (page: string, what: string): never => {
  throw new Error(
    `The ${page} release page ${what}, which its strict Content Security Policy forbids; the build is refused.`,
  );
};

/** The file a same-origin reference names, or a refusal. */
const fileOf = (
  page: string,
  reference: string,
  base: string,
  lookup: FileLookup,
): Uint8Array => {
  if (!reference.startsWith(base) || reference.startsWith("//")) {
    return refuse(page, `loads ${reference} from outside the bundle`);
  }
  return (
    lookup(reference.slice(base.length)) ??
    refuse(page, `references ${reference}, which is not an emitted file`)
  );
};

/**
 * The page with an `integrity` attribute on every script and link. `page` names
 * it in a refusal ("Wrapper's", "verify"), `base` is the path its references
 * start with, and `lookup` gives the bytes of a file under it.
 */
export const withIntegrity = async (
  page: string,
  html: string,
  base: string,
  lookup: FileLookup,
): Promise<string> => {
  if (INLINE_HANDLER.test(html)) refuse(page, "has an event-handler attribute");
  if (STYLE_ATTRIBUTE.test(html)) refuse(page, "has a style attribute");
  const tags = [...html.matchAll(TAG)];
  const replacements = await Promise.all(
    tags.map(async match => {
      const [whole, rawName = "", rawAttributes = ""] = match;
      const name = rawName.toLowerCase();
      if (name === "style") refuse(page, "has an inline <style>");
      const attributes = attributesOf(rawAttributes);
      const reference =
        name === "script" ? attributes.get("src") : attributes.get("href");
      if (reference === undefined) {
        return name === "script"
          ? refuse(page, "has an inline <script>")
          : whole;
      }
      if (attributes.has("integrity")) {
        return refuse(page, "already has an integrity attribute");
      }
      const bytes = fileOf(page, reference, base, lookup);
      const integrity = `sha256-${base64(await digest(bytes))}`;
      return whole.replace(/\s*\/?>$/u, ` integrity="${integrity}">`);
    }),
  );
  let index = 0;
  return html.replace(TAG, () => {
    const replacement = replacements[index];
    index += 1;
    return replacement ?? "";
  });
};

import { parseAst, type Plugin } from "vite";

import { normalizePath, textForms } from "./guard-text.ts";

// The Wrapper bundle must never contain a vector. Vite inlines imported data
// and drops the specifier, so the finished bundle cannot be inspected for it;
// the guard fails the build the moment the module graph reaches the `contracts`
// test-only entry or any vector (specs/client-kit/the-contracts-package.md,
// check 2).
//
// What it covers, in the build and for module requests of the dev server, in the
// main pipeline and in the worker pipeline (vite.config.ts adds it to
// `worker.plugins`; `new Worker(new URL(...))`, `?worker`, `?sharedworker`, and
// their `&inline` and `&url` forms are covered, also when a worker starts
// another):
//   - the package specifier of the `contracts` test-only entry (its `/testing`
//     subpath);
//   - any resolved id under `contracts/{dist,src}/{testing,vectors}`, which
//     also catches a relative import, a `?raw` or `?url` import, and the
//     imports `import.meta.glob` expands to;
//   - the same ids when a module is loaded;
//   - a module that writes such a path in its text. Vite reads
//     `new URL("<vectors path>", import.meta.url)` assets, and `url()` and
//     `src` paths in CSS and HTML, straight from disk without resolving them, so
//     the path is caught where it is written:
//       * a script module is parsed with the bundler's own parser (Vite's
//         `parseAst`, as TypeScript, before any transform) and every string
//         literal and template element is tested by its decoded value, as it is
//         and normalized (backslashes, `//`, `/./`, `x/..`), so JS escapes and
//         comments, regular expressions, and stray quotes cannot hide a literal;
//       * any other module (CSS, HTML, JSON, ...) is tested as written, with HTML
//         character references decoded (decimal and hex with any number of leading
//         zeros, with or without the semicolon, and every named reference that
//         expands to path characters: 16 of the standard's 2,231), with
//         percent-sequences decoded, and
//         both, each also normalized. CSS escapes such as `\74 ` are not
//         resolved by Vite, so they reach no file;
//       * the raw source text is tested too, as a further layer.
//     Only a path assembled at run time is not visible to this check. A comment
//     or string that merely mentions such a path in a bundled module fails the
//     build too, on purpose.
// CSS `@import` is refused in project stylesheets (and in an HTML page's
// `<style>` block, which Vite hands over as a stylesheet): Vite inlines an
// imported stylesheet by reading the file itself, bypassing every plugin, so its
// text cannot be scanned (following the import reliably is not possible); import
// the stylesheet from a module instead. stylelint already bans `@import`. The
// text is tested as written, without stripping comments (a stripper that does
// not know strings is bypassed by `@charset "/*"; @import "./b.css";
// a::after{content:"*\/"}`), so a comment or a string that merely mentions
// `@import` fails the build too. A CSS Modules `composes: x from "./y.module.css"`
// loads a file by reading it as well and is refused the same way (`from global`
// names no file). Other routes that read a file behind the guard's back are
// backed up by the output canary below.
// The guard works on the input side only. It does not look at `public/`: Vite
// copies those files verbatim into `dist/` without a module (the Wrapper has
// none today). The output canary in tools/build-output-canary.ts, run by
// `pnpm check:build-output` on the final files of every `dist/`, is independent
// of how a vector got there: it fails on a byte-for-byte copy of a vector
// (SHA-256) or on a vector's content (exact, minified JSON, escaped, or base64;
// also with the trailing newline trimmed and with CRLF line breaks) in any
// emitted file. Its limits: data transformed so that none of those forms remains
// (re-encoded, compressed, line-wrapped base64, hex, UTF-16 copies; re-indented
// JSON is covered only through the minified form, and only when the vector
// parses as JSON), and vectors below 64 bytes inlined into another file.
// A script module of the project that the parser cannot parse is refused (fail
// closed): the message says so. Third-party code under node_modules is not
// refused for that reason, because the resolve layer covers it, not the literal
// scan. `parseAst` can crash the process on extremely deeply nested input (about
// 20,000 nested brackets); a crash fails the build, which is the safe direction.
// Matching is case-insensitive, for case-insensitive file systems.
//
// The guard cannot be turned off for a build by mode or by environment:
// vite.config.ts refuses `VITEST` and any mode but `production` for `command:
// "build"` (and, to keep the release artifact a production build, a
// `NODE_ENV` other than `production`, and env files). The
// Vite API with `configFile: false` bypasses vite.config.ts on purpose (the
// guard's own tests use it); the release build goes through the config file.
//
// What it does not cover: the dev server's dependency pre-bundling, which
// bundles node_modules code without these hooks. Dev only; nothing ships. The
// Wrapper's config has no other plugin pipeline (no `build.rollupOptions`
// plugins, no SSR, no custom `optimizeDeps` plugins); a new one must add the
// guard too.

const TEST_ONLY_SPECIFIER =
  /^@intraverse\/se-client-contracts\/testing(?:\/|$)/iu;
const TEST_ONLY_FILE =
  /\/(?:se-client-)?contracts\/(?:dist|src)\/(?:testing|vectors)(?![\w-])/iu;

const TEST_ONLY_MENTION =
  /(?:se-client-)?contracts\/(?:(?:dist|src)\/(?:testing|vectors)(?![\w-])|testing(?![\w-]))/iu;

const SCRIPT_MODULE = /\.([cm]?[jt])sx?$/u;

const langOf = (file: string): "js" | "jsx" | "ts" | "tsx" =>
  /\.[cm]?tsx$/u.test(file)
    ? "tsx"
    : /\.[cm]?ts$/u.test(file)
      ? "ts"
      : /\.[cm]?jsx$/u.test(file)
        ? "jsx"
        : "js";

/** The decoded value of every string literal and template element in a tree. */
const stringsIn = (root: unknown): string[] => {
  const found: string[] = [];
  const stack: unknown[] = [root];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if (typeof node !== "object" || node === null) continue;
    const record = node as Record<string, unknown>;
    if (record["type"] === "Literal" && typeof record["value"] === "string") {
      found.push(record["value"]);
    }
    if (record["type"] === "TemplateElement") {
      const value = record["value"] as { cooked?: string | null; raw?: string };
      found.push(value.cooked ?? "", value.raw ?? "");
    }
    // One push per child: spreading a long node list into a single call can
    // exceed the engine's argument limit.
    for (const child of Object.values(record)) stack.push(child);
  }
  return found;
};

const isThirdParty = (id: string): boolean =>
  id.replaceAll("\\", "/").includes("/node_modules/");

const STYLESHEET =
  /\.(?:css|scss|sass|less|styl|stylus|pcss|postcss)(?:$|[?&])/iu;
const CSS_IMPORT = /@import\b/iu;
// CSS Modules `composes: a b from "./file.css"` loads the file like `@import`;
// `from global` names no file.
const CSS_COMPOSES_FROM = /\bcomposes\s*:[^;}]*\bfrom\s+(?!global\b)/iu;

/**
 * Whether a project stylesheet (or the `<style>` block of an HTML page, which
 * Vite hands over as a stylesheet module) mentions `@import`. Vite inlines an
 * imported stylesheet by reading the file itself, so the guard never sees it;
 * the stylesheet is refused instead of followed (stylelint already bans
 * `@import` in the repository's own CSS). The text is tested as written, with
 * no comment stripping: stripping comments needs a tokenizer that knows strings
 * (`@charset "/*"; @import "./b.css"; a::after{content:"*\/"}` hides an import
 * from a naive strip), and a tokenizer the guard gets wrong is a hole. A
 * comment or a string that merely mentions `@import` fails the build too, like
 * a path mention.
 */
const importsStylesheet = (code: string, id: string): boolean =>
  STYLESHEET.test(id) &&
  !isThirdParty(id) &&
  (CSS_IMPORT.test(code) || CSS_COMPOSES_FROM.test(code));

const mentionsTestOnlyPath = (code: string, id: string): boolean => {
  if (TEST_ONLY_MENTION.test(code)) return true;
  const file = id.split("?")[0] ?? id;
  if (!SCRIPT_MODULE.test(file)) {
    return textForms(code).some(form => TEST_ONLY_MENTION.test(form));
  }
  let program: unknown;
  try {
    program = parseAst(code, { lang: langOf(file) });
  } catch {
    // Third-party code is covered by the resolve layer, not by the literal
    // scan. Project code the guard cannot parse is refused: fail closed.
    if (isThirdParty(id)) return false;
    throw new Error(
      `The Wrapper guard cannot parse ${id} to check its string literals, so the build is refused (fail closed). Fix the module's syntax or keep it out of the Wrapper's graph.`,
    );
  }
  return stringsIn(program).some(
    value =>
      TEST_ONLY_MENTION.test(value) ||
      TEST_ONLY_MENTION.test(normalizePath(value)),
  );
};

const isTestOnlyId = (id: string): boolean =>
  TEST_ONLY_FILE.test(id.replaceAll("\\", "/"));

const fail = (target: string, importer?: string): never => {
  throw new Error(
    `The Wrapper bundle must not contain the contracts test-only entry or a vector: "${target}" is reached from ${importer ?? "the build entry"}.`,
  );
};

export const testOnlyEntryGuard = (): Plugin => ({
  name: "se-client-test-only-entry-guard",
  enforce: "pre",
  async resolveId(source, importer, options) {
    if (TEST_ONLY_SPECIFIER.test(source) || isTestOnlyId(source)) {
      fail(source, importer);
    }
    const resolved = await this.resolve(source, importer, {
      ...options,
      skipSelf: true,
    });
    if (resolved !== null && isTestOnlyId(resolved.id)) {
      fail(resolved.id, importer);
    }
    return resolved;
  },
  load: (id: string) => {
    if (isTestOnlyId(id)) fail(id);
    return null;
  },
  transform: (code: string, id: string) => {
    if (importsStylesheet(code, id)) {
      throw new Error(
        `The Wrapper guard refuses a CSS @import or a CSS Modules "composes ... from" a file in ${id}: Vite loads that stylesheet by reading the file itself, so the guard cannot scan it. Import the stylesheet from a module instead.`,
      );
    }
    if (mentionsTestOnlyPath(code, id)) fail("a path in its source", id);
    return null;
  },
});

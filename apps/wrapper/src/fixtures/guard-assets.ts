// CSS and HTML fixtures for the guard tests. Vite decodes percent-encoded paths
// in CSS and HTML and character references in HTML before it reads the file, so
// the guard must see the decoded path. Entries are the files themselves.

type Write = (path: string, text: string) => void;

const VECTORS = "packages/contracts/src/vectors/v.png";

/** Case name, and the entry file that must fail the build. */
export const ASSET_CASES: ReadonlyArray<readonly [string, string]> = [
  ["CSS url() with a percent-encoded path", "src/css-percent.css"],
  ["CSS image-set() with a percent-encoded path", "src/css-image-set.css"],
  ["CSS url() with an absolute-root percent-encoded path", "src/css-root.css"],
  ["the same CSS imported with ?inline", "src/css-inline.ts"],
  ["HTML src with a percent-encoded path", "page-percent.html"],
  ["HTML src with decimal character references", "page-entity.html"],
  ["HTML src with hex character references", "page-entity-hex.html"],
  [
    "HTML src with a character reference without a semicolon",
    "page-entity-bare.html",
  ],
  [
    "HTML src with an entity-encoded percent sequence",
    "page-entity-percent.html",
  ],
  ["HTML src with the named reference &percnt;", "page-percnt.html"],
  ["HTML src with a 10-digit decimal reference", "page-zeros-decimal.html"],
  ["HTML src with an 8-digit hex reference", "page-zeros-hex.html"],
  ["HTML src with a 7-digit hex reference", "page-zeros-hex7.html"],
  ["HTML src with a hex reference without a semicolon", "page-hex-bare.html"],
  ["HTML src with &sol; and &period;", "page-named-path.html"],
];

/** CSS pulled in through @import, which Vite inlines by reading the file itself. */
export const CSS_IMPORT_CASES: ReadonlyArray<readonly [string, string]> = [
  [
    "a CSS @import of a stylesheet with a vectors url()",
    "src/import-direct.ts",
  ],
  ["a nested CSS @import", "src/import-nested.ts"],
  ["a CSS @import with a percent-encoded vectors url", "src/import-percent.ts"],
  ["a CSS @import with image-set()", "src/import-image-set.ts"],
  ["a CSS @import loaded with ?inline", "src/import-inline.ts"],
  ["a CSS @import written as url()", "src/import-url-form.ts"],
  ["a CSS @import with a media query", "src/import-media.ts"],
  ["a CSS @import into a layer", "src/import-layer.ts"],
  ["a CSS @import mentioned only in a comment", "src/css-comment.css"],
  ["a CSS @import written inside a string", "src/css-string.css"],
  [
    "a CSS @import after a string that opens a comment (a stylesheet)",
    "src/css-charset-bypass.css",
  ],
  [
    "a CSS @import after a string that opens a comment (an HTML style block)",
    "page-style-bypass.html",
  ],
];

/**
 * CSS Modules `composes ... from "<file>"`, which loads the named file from
 * disk like `@import` does.
 */
export const CSS_COMPOSES_CASES: ReadonlyArray<readonly [string, string]> = [
  [
    "a composes from a stylesheet with a vectors url()",
    "src/composes-direct.ts",
  ],
  ["a chain of composes ending at a vectors url()", "src/composes-chain.ts"],
  ["a composes from a single-quoted path", "src/composes-single.ts"],
  ["a composes with several names", "src/composes-several.ts"],
  ["a composes from, split over lines", "src/composes-lines.ts"],
];

/** Files whose text is ordinary and must build. */
export const ASSET_OK_CASES: ReadonlyArray<readonly [string, string]> = [
  ["CSS with percentages and an unrelated url()", "src/css-ok.css"],
  ["HTML with entities and an unrelated image", "page-ok.html"],
  ["CSS Modules that compose from global", "src/composes-global.css"],
  ["CSS Modules that compose within the file", "src/composes-local.css"],
];

/** Script modules Vite bundles but the guard's parser rejects: refused. */
export const UNPARSABLE_CASES: ReadonlyArray<readonly [string, string]> = [
  ["a top-level return in a .js module", "src/parse-return.js"],
  ["a top-level return in a .cts module", "src/parse-return.cts"],
];

/**
 * An `@import` that follows a string holding the characters that open a comment
 * and are closed by a string further on: a comment stripper that is not aware
 * of strings reads everything between them as one comment and misses the
 * import.
 */
const charsetBypass = (leaf: string): string =>
  `@charset "/*"; @import "${leaf}"; .a::after{content:"*/"}\n`;

const css = (url: string): string => `a { background: url(${url}); }\n`;
const page = (src: string): string =>
  `<!doctype html>\n<html><body><img src="${src}"></body></html>\n`;

export const writeAssetFixtures = (write: Write): void => {
  const png = "../packages/contracts/src/vectors/v.png";
  write("src/leaf.css", `a { background: url(${png}); }\n`);
  write(
    "src/leaf-percent.css",
    "a { background: url(../packages/contracts/src/%76ectors/v.png); }\n",
  );
  write(
    "src/leaf-image-set.css",
    `a { background: image-set(url(${png}) 1x); }\n`,
  );
  write("src/mid.css", '@import "./leaf.css";\n');
  write("src/imp-direct.css", '@import "./leaf.css";\n');
  write("src/imp-nested.css", '@import "./mid.css";\n');
  write("src/imp-percent.css", '@import "./leaf-percent.css";\n');
  write("src/imp-image-set.css", '@import "./leaf-image-set.css";\n');
  write("src/imp-url-form.css", '@import url("./leaf.css");\n');
  write(
    "src/imp-media.css",
    '@import "./leaf.css" screen and (min-width: 1px);\n',
  );
  write("src/imp-layer.css", "@import url(./leaf.css) layer(base);\n");
  const entries: ReadonlyArray<readonly [string, string, string]> = [
    ["import-direct", "imp-direct", ""],
    ["import-nested", "imp-nested", ""],
    ["import-percent", "imp-percent", ""],
    ["import-image-set", "imp-image-set", ""],
    ["import-inline", "imp-direct", "?inline"],
    ["import-url-form", "imp-url-form", ""],
    ["import-media", "imp-media", ""],
    ["import-layer", "imp-layer", ""],
  ];
  for (const [entry, sheetName, query] of entries) {
    write(
      `src/${entry}.ts`,
      query === "?inline"
        ? `import sheet from "./${sheetName}.css?inline";\nconsole.log(sheet);\n`
        : `import "./${sheetName}.css";\n`,
    );
  }
  write("src/parse-return.js", "console.log(1);\nreturn;\n");
  write(
    "src/parse-html-comment.mjs",
    "<!-- an HTML comment\nconsole.log(1);\n",
  );
  write("src/parse-return.cts", "console.log(1);\nreturn;\n");
  write(
    "node_modules/bad-lib/package.json",
    JSON.stringify({ name: "bad-lib", type: "module", main: "index.js" }),
  );
  write("node_modules/bad-lib/index.js", "export const v = 1;\nreturn;\n");
  write(
    "src/uses-bad-lib.ts",
    'import { v } from "bad-lib";\nconsole.log(v);\n',
  );
  write(VECTORS, "png");
  write("src/pic.png", "png");
  write(
    "src/css-percent.css",
    css("../packages/contracts/src/%76ectors/v.png"),
  );
  write(
    "src/css-image-set.css",
    "a { background: image-set(url(../packages/contracts/src/%76ectors/v.png) 1x); }\n",
  );
  write("src/css-root.css", css("/packages/contracts/src/%76ectors/v.png"));
  write(
    "src/css-inline.ts",
    'import css from "./css-percent.css?inline";\nconsole.log(css);\n',
  );
  write("page-percent.html", page("./packages/contracts/src/%76ectors/v.png"));
  write(
    "page-entity.html",
    page("./packages/con&#116;racts/src/vec&#116;ors/v.png"),
  );
  write(
    "page-entity-hex.html",
    page("./packages/con&#x74;racts/src/vec&#x74;ors/v.png"),
  );
  write(
    "page-entity-bare.html",
    page("./packages/con&#116racts/src/vec&#116ors/v.png"),
  );
  write(
    "page-entity-percent.html",
    page("./packages/contracts/src/&#37;76ectors/v.png"),
  );
  write(
    "page-percnt.html",
    page("./packages/contracts/src/&percnt;76ectors/v.png"),
  );
  write(
    "page-zeros-decimal.html",
    page("./packages/contracts/src/&#00000000037;76ectors/v.png"),
  );
  write(
    "page-zeros-hex.html",
    page("./packages/contracts/src/&#x00000025;76ectors/v.png"),
  );
  write(
    "page-zeros-hex7.html",
    page("./packages/contracts/src/vec&#x0000074;ors/v.png"),
  );
  write(
    "page-hex-bare.html",
    page("./packages/contracts/src/vec&#x74ors/v.png"),
  );
  write(
    "page-named-path.html",
    page(".&sol;packages&sol;contracts&sol;src&sol;vectors&sol;v&period;png"),
  );
  write(
    "src/css-ok.css",
    'a { width: 100%; content: "50% off"; background: url(./pic.png); }\n',
  );
  write(
    "src/css-comment.css",
    '/* @import "./nothing.css"; */\na { color: red; }\n',
  );
  write("src/vec.module.css", `.v { background: url(${png}); }\n`);
  write("src/mid.module.css", '.m { composes: v from "./vec.module.css"; }\n');
  const composes: ReadonlyArray<readonly [string, string]> = [
    ["direct", '.a { composes: v from "./vec.module.css"; }\n'],
    ["chain", '.a { composes: m from "./mid.module.css"; }\n'],
    ["single", ".a { composes: v from './vec.module.css'; }\n"],
    ["several", '.a { composes: v w x from "./vec.module.css"; }\n'],
    ["lines", '.a {\n  composes: v\n    from\n    "./vec.module.css";\n}\n'],
  ];
  for (const [name, text] of composes) {
    write(`src/composes-${name}.module.css`, text);
    write(
      `src/composes-${name}.ts`,
      `import styles from "./composes-${name}.module.css";\nconsole.log(styles);\n`,
    );
  }
  write("src/composes-global.css", ".a { composes: b from global; }\n");
  write("src/composes-local.css", ".b { color: red; }\n.a { composes: b; }\n");
  write(
    "src/css-string.css",
    'a::after { content: "@import ./nothing.css"; }\n',
  );
  write("src/css-charset-bypass.css", charsetBypass("./leaf.css"));
  write(
    "page-style-bypass.html",
    `<!doctype html>\n<html><head><style>${charsetBypass("./src/leaf.css")}</style></head><body></body></html>\n`,
  );
  write(
    "page-ok.html",
    '<!doctype html>\n<html><body><p>Tom &amp; Jerry &copy; 100%</p><img src="./src/pic.png"></body></html>\n',
  );
};

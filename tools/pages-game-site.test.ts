import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { headersStep, WRAPPER_ORIGIN } from "./pages-headers-step.ts";
import {
  jobRange,
  keyLine,
  keyLines,
  type Line,
  mappingAt,
  readLines,
  scalarAt,
  stepRanges,
} from "./workflow-text.ts";

// The reference game's staging site in the Pages workflow
// (.github/workflows/pages.yml; specs/client-kit.md, The game's site; ADR-008,
// decision 3's amendment note): its artifact from the build job, its static
// layout in the deploy job, and its `_headers` from the headers step, whose
// own script runs here (tools/pages-headers-step.ts).

const pages: Line[] = readLines(
  readFileSync(
    join(import.meta.dirname, "..", ".github", "workflows", "pages.yml"),
    "utf8",
  ),
);

/** The one `run:` script of job `job` that contains `text`. */
const runWith = (job: string, text: string): string => {
  const found = stepRanges(pages, jobRange(pages, job))
    .flatMap(([from, to]) =>
      keyLines(pages, from, to, 8, "run").map(index => scalarAt(pages, index)),
    )
    .filter(script => script.includes(text));
  const [script] = found;
  if (found.length !== 1 || script === undefined) {
    throw new Error(`expected one run: with ${text} in ${job}`);
  }
  return script;
};

/** Every value of key `key`, at any indentation, in file order. */
const valuesOf = (key: string): string[] =>
  pages.flatMap((line, index) =>
    line.text.startsWith(`${key}: `) ? [scalarAt(pages, index)] : [],
  );

// The reference game's page policy, from its `<meta>` (the build keeps it).
const GAME_META_CSP = (() => {
  const html = readFileSync(
    join(import.meta.dirname, "..", "apps", "reference-game", "index.html"),
    "utf8",
  );
  const csp =
    /http-equiv="Content-Security-Policy"\s+content="(?<csp>[^"]+)"/u.exec(html)
      ?.groups?.["csp"];
  if (csp === undefined) throw new Error("the game page has no <meta> CSP");
  return csp;
})();

describe("the reference game's Pages site", () => {
  it("makes the game's artifact from the dry run's two kept copies", () => {
    const [start, end] = jobRange(pages, "build");
    expect(
      mappingAt(pages, keyLine(pages, start, end, 4, "outputs")),
    ).toContain("game-digest: ${{ steps.game.outputs.game-digest }}");
    expect(runWith("build", "release-dry-run.ts")).toContain(
      "pnpm exec tsx tools/release-dry-run.ts --keep --out",
    );
    const make = runWith("build", "reference-game-artifact-cli.ts");
    expect(make).toContain(
      '--first "$dry_run/first" --second "$dry_run/second-copy" --out "$out"',
    );
    expect(make).toContain(
      "sha256sum --check --strict se-client-reference-game.tar.sha256",
    );
    expect(valuesOf("path")).toContain("${{ steps.game.outputs.game-path }}");
    expect(valuesOf("name")).toContain("se-client-reference-game.tar");
  });

  it("serves the game at the root of its own static site", () => {
    const unpack = runWith("deploy-stage", "tar -x");
    expect(unpack).toContain(
      '-f "$download/se-client-reference-game.tar" -C "$game"',
    );
    expect(unpack).toContain('[ ! -f "$game/index.html" ]');
    expect(unpack).toContain(
      "for file in _worker.js _routes.json _redirects _headers environment-config.json; do",
    );
    expect(unpack).toContain('[ -e "$game/$file" ]');
    // The worker, the routes, and a configuration document go to the
    // Wrapper's and the verifier's sites only.
    expect(unpack).toContain('for site in "$wrapper" "$verifier"; do');
    expect(unpack).not.toMatch(/>\s*"\$game\//u);
    expect(unpack).not.toMatch(/cp [^\n]*"\$game\//u);
  });
});

/** The first `Permissions-Policy` line of a `_headers` file. */
const permissionsLine = (text: string | null): string | undefined =>
  text?.split("\n").find(entry => entry.startsWith("  Permissions-Policy:"));

describe("the game's _headers", () => {
  const step = headersStep();
  afterEach(step.cleanup);
  // A Permissions-Policy of its own, so the test sees where the game's
  // comes from.
  const PERMISSIONS = "camera=(), usb=()";
  const HEADERS = {
    "/*": { "Permissions-Policy": PERMISSIONS },
    "/verify/*": {},
  };
  const NO_ORIGIN =
    "The Wrapper's configuration document has no Wrapper origin.";

  it("is the page's policy, framed by the Wrapper and the operators", () => {
    const result = step.run(HEADERS, {
      game: ["https://game.example"],
      operator: ["https://op-b.example", "https://op-a.example"],
    });
    expect(result.status).toBe(0);
    // `frame-ancestors` checks every ancestor (operator, Wrapper, game).
    expect(result.game).toBe(
      [
        "/*",
        `  Content-Security-Policy: ${GAME_META_CSP}; frame-ancestors ${WRAPPER_ORIGIN} https://op-a.example https://op-b.example`,
        `  Permissions-Policy: ${PERMISSIONS}`,
        "  Referrer-Policy: no-referrer",
        "  X-Content-Type-Options: nosniff",
        "",
      ].join("\n"),
    );
    // The game's own origin list never frames the game.
    expect(result.game).not.toContain("game.example");
  });

  it("is framed by the Wrapper alone when there is no operator origin", () => {
    const result = step.run(HEADERS, { operator: [] });
    expect(result.status).toBe(0);
    expect(result.game).toContain(`; frame-ancestors ${WRAPPER_ORIGIN}\n`);
    expect(result.game).not.toContain("'none'\n");
  });

  it("takes the Wrapper's own Permissions-Policy from headers.json", () => {
    const result = step.run(
      JSON.parse(
        readFileSync(
          join(
            import.meta.dirname,
            "..",
            "apps",
            "wrapper",
            "dist",
            "headers.json",
          ),
          "utf8",
        ),
      ),
    );
    expect(result.status).toBe(0);
    expect(permissionsLine(result.game)).toBeDefined();
    expect(permissionsLine(result.game)).toBe(permissionsLine(result.wrapper));
  });

  it("refuses a headers.json with no Permissions-Policy in its /* rule", () => {
    const result = step.run({ "/*": {}, "/verify/*": {} });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(
      "headers.json has no Permissions-Policy in its /* rule.",
    );
    expect(result.game).toBeNull();
  });

  it("takes the Wrapper's origin with its port from playApiBaseUrl", () => {
    const result = step.run(HEADERS, {
      playApiBaseUrl: "https://wrapper.example:8443/play/v1",
    });
    expect(result.status).toBe(0);
    expect(result.game).toContain(
      "frame-ancestors https://wrapper.example:8443\n",
    );
  });

  it("refuses a document without playApiBaseUrl", () => {
    const result = step.run(HEADERS, { playApiBaseUrl: null });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(NO_ORIGIN);
    expect(result.game).toBeNull();
  });

  it.each([
    ["plain http", "http://wrapper.example/play/v1"],
    ["another path", "https://wrapper.example/verify/v1"],
    ["a trailing slash", "https://wrapper.example/play/v1/"],
    ["upper case", "https://WRAPPER.example/play/v1"],
    ["a directive", "https://wrapper.example;script-src/play/v1"],
  ])("refuses a playApiBaseUrl with %s, without printing it", (_, url) => {
    const result = step.run(HEADERS, { playApiBaseUrl: url });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(NO_ORIGIN);
    expect(result.output).not.toContain(url);
    expect(result.wrapper).toBeNull();
    expect(result.game).toBeNull();
  });
});

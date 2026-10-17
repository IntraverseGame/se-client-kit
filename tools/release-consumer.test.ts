import { describe, expect, it } from "vitest";

import { importSpecifiers } from "./release-consumer.ts";

const ENTRY = { types: "./dist/index.d.ts", default: "./dist/index.js" };

describe("importSpecifiers", () => {
  it("imports every exports key", () => {
    expect(
      importSpecifiers("@intraverse/se-client-shell", {
        ".": ENTRY,
        "./controller": ENTRY,
      }),
    ).toEqual({
      specifiers: [
        "@intraverse/se-client-shell",
        "@intraverse/se-client-shell/controller",
      ],
      problems: [],
    });
  });

  it("leaves out the contracts test-only entry", () => {
    expect(
      importSpecifiers("@intraverse/se-client-contracts", {
        ".": ENTRY,
        "./testing": ENTRY,
      }).specifiers,
    ).toEqual(["@intraverse/se-client-contracts"]);
  });

  it("keeps a ./testing key of another package", () => {
    expect(
      importSpecifiers("@intraverse/se-client-shell", {
        ".": ENTRY,
        "./testing": ENTRY,
      }).specifiers,
    ).toEqual([
      "@intraverse/se-client-shell",
      "@intraverse/se-client-shell/testing",
    ]);
  });

  it("imports the package name for a conditions-only or string exports", () => {
    expect(importSpecifiers("p", ENTRY).specifiers).toEqual(["p"]);
    expect(importSpecifiers("p", "./dist/index.js").specifiers).toEqual(["p"]);
  });

  it("reports a subpath pattern it cannot import", () => {
    expect(importSpecifiers("p", { ".": ENTRY, "./*": ENTRY })).toEqual({
      specifiers: ["p"],
      problems: ["p: the exports pattern ./* is not checked"],
    });
  });
});

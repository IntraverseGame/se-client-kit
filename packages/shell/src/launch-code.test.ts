// T-4a (W-1, W-1a): the launch code is the whole fragment, read once, taken out
// of the URL with `replaceState`, and returned sealed; an empty or over-long
// fragment, or a code only in the query string, is no code; a code that will
// not be redeemed is discarded.

import { describe, expect, it } from "vitest";

import {
  discardLaunchCode,
  MAX_LAUNCH_CODE_LENGTH,
  takeLaunchCode,
} from "./launch-code.ts";
import { REDACTED, revealSecret } from "./redaction.ts";

const BASE = "https://play.example.com/l";

type Replaced = { readonly data: unknown; readonly url: string };

const historyOf = (
  replaced: Replaced[],
): { readonly replaceState: (data: null, u: string, url: string) => void } => ({
  replaceState: (data, _unused, url) => {
    replaced.push({ data, url });
  },
});

/** The `location` of `href`, with its `hash` as the platform gives it. */
const at = (href: string): { readonly hash: string; readonly href: string } => {
  const url = new URL(href);
  return { href: url.href, hash: url.hash };
};

const take = (
  href: string,
): {
  readonly code: ReturnType<typeof takeLaunchCode>;
  readonly replaced: readonly Replaced[];
} => {
  const replaced: Replaced[] = [];
  return { code: takeLaunchCode(at(href), historyOf(replaced)), replaced };
};

const reveal = (code: ReturnType<typeof takeLaunchCode>): string => {
  if (code === undefined) throw new TypeError("no code");
  return revealSecret(code);
};

describe("the launch code (W-1)", () => {
  it("is the whole fragment, and the URL keeps no fragment and no state", () => {
    const { code, replaced } = take(`${BASE}?operator=1#lc_abc`);
    expect(reveal(code)).toBe("lc_abc");
    expect(replaced).toEqual([{ data: null, url: `${BASE}?operator=1` }]);
  });

  it("is sealed: it prints [redacted] in every form", () => {
    const { code } = take(`${BASE}#lc_secret`);
    expect(String(code)).toBe(REDACTED);
    expect(JSON.stringify({ code })).toBe(`{"code":"${REDACTED}"}`);
    expect(`${String(code)}`).not.toContain("lc_secret");
  });

  it("does not check the prefix", () => {
    expect(reveal(take(`${BASE}#xyz`).code)).toBe("xyz");
  });

  it("is measured raw, without decoding: 128 characters pass, 129 do not", () => {
    const at128 = `%41${"a".repeat(MAX_LAUNCH_CODE_LENGTH - 3)}`;
    expect(reveal(take(`${BASE}#${at128}`).code)).toBe(at128);
    const at129 = take(`${BASE}#${"a".repeat(MAX_LAUNCH_CODE_LENGTH + 1)}`);
    expect(at129.code).toBeUndefined();
    expect(at129.replaced).toEqual([{ data: null, url: BASE }]);
  });
});

describe("no launch code (W-1a)", () => {
  it("an empty fragment is none, and the `#` is removed", () => {
    const { code, replaced } = take(`${BASE}#`);
    expect(code).toBeUndefined();
    expect(replaced).toEqual([{ data: null, url: BASE }]);
  });

  it("no fragment is none, and the URL is left alone", () => {
    const { code, replaced } = take(BASE);
    expect(code).toBeUndefined();
    expect(replaced).toEqual([]);
  });

  it("a code only in the query string is never read", () => {
    const { code, replaced } = take(`${BASE}?launchCode=lc_abc`);
    expect(code).toBeUndefined();
    expect(replaced).toEqual([]);
  });

  it("a fragment that cannot be removed is not returned", () => {
    const code = takeLaunchCode(at(`${BASE}#lc_abc`), {
      replaceState: () => {
        throw new Error("SecurityError");
      },
    });
    expect(code).toBeUndefined();
  });
});

describe("a launch code that will not be redeemed", () => {
  it("is discarded: its text can no longer be read", () => {
    const { code } = take(`${BASE}#lc_abc`);
    expect(reveal(code)).toBe("lc_abc");
    discardLaunchCode(code);
    expect(() => reveal(code)).toThrow(TypeError);
  });

  it("no code is a no-op", () => {
    const { code } = take(BASE);
    expect(() => {
      discardLaunchCode(code);
    }).not.toThrow();
  });
});

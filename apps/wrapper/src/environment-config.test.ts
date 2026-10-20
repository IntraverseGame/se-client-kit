// The environment configuration document (specs/wrapper.md, Configuration)
// and the two boot rules, each in both directions: `production` refuses a
// `minRpcQuorum` below 2 (W-26a), and a source with fewer configured endpoints
// than `minRpcQuorum` is refused (W-26b). The chain part is the shell's
// `validateChainConfig`, reached through the shell's public entry.

import { describe, expect, it } from "vitest";

import {
  ENVIRONMENT_CONFIG_FIELDS,
  type EnvironmentConfig,
  type EnvironmentConfigIssueCode,
  validateEnvironmentConfig,
} from "./environment-config.ts";
import {
  endpoints,
  environmentDocument,
  localDocument,
  SE_ORIGIN,
  SOURCE,
} from "./fixtures/environment.ts";

const codes = (document: unknown): readonly EnvironmentConfigIssueCode[] => {
  const result = validateEnvironmentConfig(document, SE_ORIGIN);
  return result.ok ? [] : result.issues.map(issue => issue.code);
};

const accepted = (document: unknown): EnvironmentConfig => {
  const result = validateEnvironmentConfig(document, SE_ORIGIN);
  if (!result.ok) {
    throw new Error(result.issues.map(issue => issue.code).join(", "));
  }
  return result.config;
};

/** The issues of the fixture document with `overrides`, codes and fields. */
const issuesOf = (overrides: Readonly<Record<string, unknown>>): unknown => {
  const result = validateEnvironmentConfig(
    environmentDocument(overrides),
    SE_ORIGIN,
  );
  return result.ok ? [] : result.issues;
};

describe("validateEnvironmentConfig", () => {
  it("accepts a production document and returns it typed and frozen", () => {
    const config = accepted(environmentDocument());
    expect(config.chain.environment).toBe("production");
    expect(config.chain.minRpcQuorum).toBe(2);
    expect(config.chain.degraded).toBe(false);
    expect(config.playApiBaseUrl).toBe("https://se.example/play/v1");
    expect(config.verifyBaseUrl).toBe("https://verify.example/");
    expect(config.gameOrigins).toEqual(["https://game.example"]);
    expect(config.operatorOrigins).toEqual(["https://operator.example"]);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.gameOrigins)).toBe(true);
    expect(Object.isFrozen(config.operatorOrigins)).toBe(true);
  });

  it("lists every field of the Configuration table", () => {
    expect(new Set(ENVIRONMENT_CONFIG_FIELDS)).toEqual(
      new Set(Object.keys(environmentDocument())),
    );
  });

  it("refuses a field the schema does not list, naming the field only", () => {
    const result = validateEnvironmentConfig(
      environmentDocument({ telemetryUrl: "https://collector.example" }),
      SE_ORIGIN,
    );
    expect(result).toEqual({
      ok: false,
      issues: [{ code: "unknown-field", field: "telemetryUrl" }],
    });
  });

  it("refuses a document that is not an object", () => {
    expect(codes(null)).toContain("invalid-environment");
    expect(codes([])).toContain("invalid-play-api-base");
    expect(codes("{}")).toContain("invalid-game-origins");
  });
});

describe("boot rule W-26a: production needs a quorum of at least 2", () => {
  it("refuses production with minRpcQuorum 1", () => {
    expect(
      codes(
        environmentDocument({
          minRpcQuorum: 1,
          rpcEndpoints: { [SOURCE]: endpoints(1) },
        }),
      ),
    ).toEqual(["production-quorum"]);
  });

  it("accepts production with minRpcQuorum 2 and two endpoints", () => {
    expect(accepted(environmentDocument()).chain.minRpcQuorum).toBe(2);
  });

  it("defaults minRpcQuorum to 2 when the document sets none", () => {
    const document = environmentDocument();
    delete document["minRpcQuorum"];
    expect(accepted(document).chain.minRpcQuorum).toBe(2);
    expect(
      codes({ ...document, rpcEndpoints: { [SOURCE]: endpoints(1) } }),
    ).toEqual(["quorum-unreachable"]);
  });

  it.each(["local", "preview"])(
    "accepts %s with minRpcQuorum 1, marked degraded",
    environment => {
      const config = accepted(localDocument({ environment }));
      expect(config.chain.minRpcQuorum).toBe(1);
      expect(config.chain.degraded).toBe(true);
    },
  );
});

describe("boot rule W-26b: every source can reach the quorum", () => {
  it("refuses a source with fewer endpoints than minRpcQuorum", () => {
    expect(
      codes(
        environmentDocument({
          minRpcQuorum: 3,
          rpcEndpoints: { [SOURCE]: endpoints(2) },
        }),
      ),
    ).toEqual(["quorum-unreachable"]);
  });

  it("accepts a source with exactly minRpcQuorum endpoints", () => {
    const config = accepted(
      environmentDocument({
        minRpcQuorum: 3,
        rpcEndpoints: { [SOURCE]: endpoints(3) },
      }),
    );
    expect(config.chain.sources[SOURCE]?.endpoints).toHaveLength(3);
  });

  it("refuses a second source that cannot reach the quorum", () => {
    expect(
      codes(
        environmentDocument({
          rpcEndpoints: {
            [SOURCE]: endpoints(2),
            other: endpoints(1, "other"),
          },
          entropyChainId: { [SOURCE]: 8453, other: 10 },
          tipLagMargin: { [SOURCE]: 2, other: 2 },
        }),
      ),
    ).toEqual(["quorum-unreachable"]);
  });

  it("refuses two endpoints of one provider (the shell's rule)", () => {
    expect(
      codes(
        environmentDocument({
          rpcEndpoints: {
            [SOURCE]: [
              { provider: "p1", url: "https://rpc1.example/base" },
              { provider: "p1", url: "https://rpc2.example/base" },
            ],
          },
        }),
      ),
    ).toEqual(["shared-provider"]);
  });
});

describe("the Wrapper's fields", () => {
  it.each([
    ["https://se.example/play/v1/", "a trailing slash"],
    ["https://se.example/api", "another path"],
    ["http://se.example/play/v1", "plain http off loopback"],
    ["https://user@se.example/play/v1", "credentials"],
    ["https://se.example/play/v1?x=1", "a query"],
    ["/play/v1", "a relative URL"],
    [42, "a number"],
  ])("refuses playApiBaseUrl %s (%s)", (value, _reason) => {
    expect(codes(environmentDocument({ playApiBaseUrl: value }))).toEqual([
      "invalid-play-api-base",
    ]);
  });

  it("accepts a loopback http Play API base", () => {
    expect(accepted(localDocument()).playApiBaseUrl).toBe(
      "http://localhost:8080/play/v1",
    );
  });

  it.each([
    ["verify.example", "no scheme"],
    ["https://verify.example/#round", "a fragment"],
    ["javascript:alert(1)", "another scheme"],
  ])("refuses verifyBaseUrl %s (%s)", (value, _reason) => {
    expect(codes(environmentDocument({ verifyBaseUrl: value }))).toEqual([
      "invalid-verify-base",
    ]);
  });

  it.each([
    [[], "an empty list"],
    [["https://game.example/"], "a path"],
    [["https://Game.example"], "not in its serialized form"],
    [["https://game.example", "https://game.example"], "a duplicate"],
    [["http://game.example"], "plain http off loopback"],
    ["https://game.example", "not a list"],
  ])("refuses gameOrigins %j (%s)", (value, _reason) => {
    expect(codes(environmentDocument({ gameOrigins: value }))).toEqual([
      "invalid-game-origins",
    ]);
  });

  it("accepts an empty operatorOrigins list (no operator may embed)", () => {
    expect(
      accepted(environmentDocument({ operatorOrigins: [] })).operatorOrigins,
    ).toEqual([]);
  });

  it("refuses an operator origin that is not an origin", () => {
    expect(
      codes(environmentDocument({ operatorOrigins: ["operator.example"] })),
    ).toEqual(["invalid-operator-origins"]);
  });

  describe("the disjoint-origins rule (T-9a, 7)", () => {
    const GAME = "https://game.example";
    const OPERATOR = "https://operator.example";

    it.each<[string, readonly string[], readonly string[], readonly string[]]>([
      [
        "an operator origin that is a game origin",
        [GAME],
        [GAME],
        ["operatorOrigins"],
      ],
      [
        "an operator origin that is the SE origin",
        [GAME],
        [SE_ORIGIN],
        ["operatorOrigins"],
      ],
      [
        "a game origin that is the SE origin",
        [GAME, SE_ORIGIN],
        [OPERATOR],
        ["gameOrigins"],
      ],
      [
        "both",
        [SE_ORIGIN, GAME],
        [OPERATOR, GAME],
        ["operatorOrigins", "gameOrigins"],
      ],
    ])("refuses %s, naming the field only", (_what, game, operator, fields) => {
      expect(
        issuesOf({ gameOrigins: game, operatorOrigins: operator }),
      ).toEqual(fields.map(field => ({ code: "overlapping-origins", field })));
    });

    it("accepts disjoint lists, and an SE origin on neither", () => {
      expect(
        accepted(
          environmentDocument({
            gameOrigins: [GAME, "https://games.example"],
            operatorOrigins: [OPERATOR, "https://lobby.operator.example"],
          }),
        ).operatorOrigins,
      ).toEqual([OPERATOR, "https://lobby.operator.example"]);
    });

    it("checks the SE origin the Wrapper runs at, not one in the document", () => {
      const document = environmentDocument({ operatorOrigins: [OPERATOR] });
      expect(validateEnvironmentConfig(document, OPERATOR).ok).toBe(false);
      expect(validateEnvironmentConfig(document, SE_ORIGIN).ok).toBe(true);
    });
  });

  it("reports every issue at once", () => {
    expect(
      codes(
        environmentDocument({
          environment: "staging",
          verifyBaseUrl: undefined,
          verifyApiBaseUrl: undefined,
          gameOrigins: undefined,
        }),
      ),
    ).toEqual([
      "invalid-environment",
      "invalid-verify-base",
      "invalid-verify-api-base",
      "invalid-game-origins",
    ]);
  });
});

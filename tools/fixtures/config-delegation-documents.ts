// The shared cases of the wallet delegation's two fields (W-62, W-63,
// ADR-012): `signingPageOrigin` and `acceptPendingNotices`, run through both
// validators by `tools/config-parity.test.ts` with the other shared documents
// (V-3). A name starting "valid" is accepted by both.

import {
  type ConfigCase,
  configDocument,
  LOCAL_ORIGIN,
  OWN_ORIGIN,
  SOURCE,
} from "./config-documents.ts";

/** A signing page on a registrable domain of its own. */
const SIGNER = "https://signer.example-signing.org";

/** A valid preview document with `overrides`. */
const previewDocument = (
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> =>
  configDocument({ environment: "preview", ...overrides });

/** A valid local document, for a page at `LOCAL_ORIGIN`, with `overrides`. */
const localDocument = (
  environment: string,
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> =>
  configDocument({
    environment,
    playApiBaseUrl: `${LOCAL_ORIGIN}/play/v1`,
    verifyBaseUrl: `${LOCAL_ORIGIN}/verify`,
    verifyApiBaseUrl: `${LOCAL_ORIGIN}/verify/v1`,
    rpcEndpoints: {
      [SOURCE]: [
        { provider: "p1", url: "https://rpc1.example/eth" },
        { provider: "p2", url: "https://rpc2.example/eth" },
      ],
    },
    ...overrides,
  });

const DOCUMENTS: readonly (readonly [string, unknown, string?])[] = [
  ["valid, without either field", configDocument()],
  [
    "valid, a production signing page and no pending notices",
    configDocument({ signingPageOrigin: SIGNER, acceptPendingNotices: false }),
  ],
  [
    "valid, a preview signing page that accepts pending notices",
    previewDocument({ signingPageOrigin: SIGNER, acceptPendingNotices: true }),
  ],
  [
    "valid, acceptPendingNotices without signingPageOrigin",
    previewDocument({ acceptPendingNotices: true }),
  ],
  [
    "valid, a loopback signing page in local",
    localDocument("local", { signingPageOrigin: "http://localhost:8090" }),
    LOCAL_ORIGIN,
  ],
  [
    "a loopback signing page in preview",
    localDocument("preview", { signingPageOrigin: "http://localhost:8090" }),
    LOCAL_ORIGIN,
  ],
  [
    "a signing page on the local page's own origin",
    localDocument("local", { signingPageOrigin: LOCAL_ORIGIN }),
    LOCAL_ORIGIN,
  ],
  ...(
    [
      ["not a string", 1],
      ["with a path", `${SIGNER}/signer`],
      ["with a trailing slash only", `${SIGNER}/`],
      ["in upper case", "https://Signer.example-signing.org"],
      ["over plain http on a public host", "http://signer.example-signing.org"],
      ["with credentials", "https://user@signer.example-signing.org"],
      ["with the default port", `${SIGNER}:443`],
      ["empty", ""],
      ["null", null],
    ] as const
  ).map(([name, value]): readonly [string, unknown] => [
    `signingPageOrigin ${name}`,
    configDocument({ signingPageOrigin: value }),
  ]),
  [
    "signingPageOrigin on the Wrapper's own origin",
    configDocument({ signingPageOrigin: OWN_ORIGIN }),
  ],
  [
    "signingPageOrigin on the Wrapper's registrable domain",
    configDocument({ signingPageOrigin: "https://signer.se.example" }),
  ],
  [
    "signingPageOrigin the verify page's origin",
    configDocument({
      verifyBaseUrl: "https://verify.example-verify.org/verify",
      signingPageOrigin: "https://verify.example-verify.org",
    }),
  ],
  [
    "signingPageOrigin an operator origin",
    configDocument({ signingPageOrigin: "https://operator.example" }),
  ],
  [
    "signingPageOrigin a game origin",
    configDocument({ signingPageOrigin: "https://game.example" }),
  ],
  ...(["true", 1, null, {}] as const).map(
    (value): readonly [string, unknown] => [
      `acceptPendingNotices ${JSON.stringify(value)}`,
      previewDocument({ acceptPendingNotices: value }),
    ],
  ),
  [
    "acceptPendingNotices true in production",
    configDocument({ signingPageOrigin: SIGNER, acceptPendingNotices: true }),
  ],
  [
    "acceptPendingNotices true in production, without signingPageOrigin",
    configDocument({ acceptPendingNotices: true }),
  ],
];

/** The wallet delegation's shared cases. */
export const DELEGATION_DOCUMENTS: readonly ConfigCase[] = DOCUMENTS.map(
  ([name, document, ownOrigin = OWN_ORIGIN]) => ({ name, document, ownOrigin }),
);

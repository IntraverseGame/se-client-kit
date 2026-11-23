// VT-3 and VT-16: the closed reader (The evidence, since slice S7 of #220)
// accepts a body that carries every optional field the vendored verify API
// document defines, on a config round started with a key delegation and on a
// book round. `tools/verify-api-fields.test.ts` holds each reader's fields to
// the document; this holds that a body using all of them is read. The optional
// fields are read from the document (`tools/verify-api-document.ts`: each
// object schema's `properties` less its `required`), never listed by hand.

import { describe, expect, it } from "vitest";

import {
  objectSchemas,
  optionalProperties,
  propertiesAt,
  schemaText,
} from "../../../tools/verify-api-document.ts";
import { bookBody } from "./fixtures/book-body.ts";
import { asRecord, delegatedBody } from "./fixtures/verify-body.ts";
import { parseEvidence } from "./verify-body.ts";
import { CHECK_NAMES } from "./verify-readers.ts";

type Json = Record<string, unknown>;

const HASH = `0x${"ab".repeat(32)}`;
const AMOUNT = { amount: "194", currency: "EUR", decimals: 2 };

/** Every check name once, each with a detail. */
const CHECKS = CHECK_NAMES.map(name => ({
  name,
  result: "passed",
  detail: `the ${name} check`,
}));

/** The optional fields any round's body may carry, set on `body`. */
const withOptionals = (body: Json): Json => ({
  ...body,
  closeReason: "expired",
  voidReason: "ROOT_LOST",
  rejectCode: "INSUFFICIENT_FUNDS",
  kernel: {
    ...asRecord(body["kernel"]),
    vectorSets: ["kernel/public/v1/seed"],
  },
  commitment: { ...asRecord(body["commitment"]), commitmentRef: "commit-1" },
  entropy: { ...asRecord(body["entropy"]), value: HASH },
  reveal: {
    ...asRecord(body["reveal"]),
    seed: HASH,
    configuration: "0x0102",
  },
  transcriptHash: HASH,
  recomputed: { ...asRecord(body["recomputed"]), payout: { ...AMOUNT } },
  checks: CHECKS,
});

/** The object schemas of a body's nested objects, by the field that holds one. */
const NESTED: Readonly<Record<string, string>> = {
  game: "Game",
  commitment: "Commitment",
  entropy: "Entropy",
  reveal: "Reveal",
  recomputed: "Recomputation",
};

/** `schema`'s optional fields that `value` lacks, each prefixed with `at`. */
const lacking = (value: unknown, schema: string, at: string): string[] =>
  optionalProperties(schema)
    .filter(key => !Object.hasOwn(asRecord(value), key))
    .map(key => `${at}${key}`);

/**
 * The document's optional fields that `body` leaves out, apart from `except`:
 * the top level's (`RoundVerification`'s), each nested object's, and each
 * check's, every list derived from the document.
 */
const missingOptionals = (body: Json, except: readonly string[]): string[] => {
  return [
    ...lacking(body, "RoundVerification", ""),
    ...Object.entries(NESTED).flatMap(([field, schema]) =>
      lacking(body[field], schema, `${field}.`),
    ),
    ...(body["checks"] as readonly unknown[]).flatMap(check =>
      lacking(check, "Check", "checks[]."),
    ),
  ].filter(key => !except.includes(key));
};

/**
 * What a book round never carries: a delegation (V-22), and the config round's
 * fields a body with `book` fails on (the errors table; V-10, V-18).
 */
const BOOK_ROUND_LACKS: readonly string[] = [
  "keyDelegation",
  "readyHash",
  "game.terms",
  "commitment.createRoundAuth",
];

/** A book round with every optional field the document defines for it. */
const maximalBookBody = async (): Promise<Json> => {
  const body = withOptionals(await bookBody());
  return {
    ...body,
    seedHash: HASH,
    commitment: {
      ...asRecord(body["commitment"]),
      registryChainId: 1,
      registryAddress: `0x${"12".repeat(20)}`,
      adminSigner: `0x${"34".repeat(20)}`,
    },
  };
};

/** A delegated config round with every optional field the document defines. */
const maximalConfigBody = (): Json => {
  const body = withOptionals(delegatedBody());
  return {
    ...body,
    // A config round's `recomputed.draw` is read as nothing.
    recomputed: {
      ...asRecord(body["recomputed"]),
      draw: { index: 0, multiplierMilli: "0" },
    },
    shape: [2],
    payout: { ...AMOUNT },
    seedHash: HASH,
    readyHash: HASH,
    actions: [
      {
        sequence: 1,
        kind: "action",
        action: "pick",
        path: [1],
        previous: HASH,
        signature: `0x${"ab".repeat(65)}`,
      },
    ],
  };
};

describe("a body with every optional field the document defines", () => {
  it("is read on a config round with a key delegation", () => {
    const body = maximalConfigBody();
    const evidence = parseEvidence(body);
    expect(evidence).toBeDefined();
    expect(evidence?.keyDelegation?.noticeId).toBe("en-draft-1");
    expect(evidence?.closeReason).toBe("expired");
    expect(evidence?.payout?.value).toBe(194n);
  });

  it("looks at every object schema that has an optional field", () => {
    // `BookVerification`'s are the book round's table (its own test), and
    // `Problem` is never read as a body (V-9, V-10).
    expect(
      objectSchemas()
        .filter(name => optionalProperties(name).length > 0)
        .toSorted(),
    ).toEqual(
      [
        "RoundVerification",
        ...Object.values(NESTED),
        "Check",
        "BookVerification",
        "Problem",
      ].toSorted(),
    );
  });

  it("carries every optional field the document defines, `book` apart", () => {
    const body = maximalConfigBody();
    expect(missingOptionals(body, ["book"])).toEqual([]);
  });

  it("is read on a book round, its table's every field included", async () => {
    const body = await maximalBookBody();
    expect(missingOptionals(body, BOOK_ROUND_LACKS)).toEqual([]);
    expect(Object.keys(asRecord(body["book"])).toSorted()).toEqual(
      propertiesAt(schemaText("BookVerification"), 6),
    );
    const evidence = parseEvidence(body);
    expect(evidence).toBeDefined();
    expect(evidence?.book?.mode).toBeDefined();
  });
});

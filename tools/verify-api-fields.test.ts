// The verify page's closed reader (specs/verify-page.md, The evidence, since
// slice S7 of #220) against the vendored verify API document: every object
// schema of the document is read, and each reader names exactly the fields
// the schema's `properties` define. A document that adds or removes a field,
// or a reader that names one the document lacks, fails here until the other
// follows. The readers' field objects are exported for this test only.

import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import {
  objectSchemas,
  propertiesAt,
  schemaText as schema,
  verifyApiDocument as document,
} from "./verify-api-document.ts";

const root = join(import.meta.dirname, "..");

type Fields = Readonly<Record<string, unknown>>;
const load = async (name: string): Promise<Readonly<Record<string, Fields>>> =>
  (await import(
    pathToFileURL(join(root, "apps", "verify", "src", name)).href
  )) as Readonly<Record<string, Fields>>;

const [body, parts, game, amount, book, delegation] = await Promise.all([
  load("verify-body.ts"),
  load("verify-parts.ts"),
  load("verify-game.ts"),
  load("verify-amount.ts"),
  load("verify-book.ts"),
  load("verify-delegation.ts"),
]);

/** Each object schema of the document, with the reader's field object. */
const READERS: Readonly<Record<string, Fields | undefined>> = {
  RoundVerification: body["ROUND_VERIFICATION_FIELDS"],
  Kernel: parts["KERNEL_FIELDS"],
  SignedAction: parts["SIGNED_ACTION_FIELDS"],
  Check: parts["CHECK_FIELDS"],
  RecomputedStep: parts["RECOMPUTED_STEP_FIELDS"],
  Recomputation: parts["RECOMPUTATION_FIELDS"],
  Entropy: parts["ENTROPY_FIELDS"],
  Commitment: parts["COMMITMENT_FIELDS"],
  CreateRoundAuth: parts["CREATE_ROUND_AUTH_FIELDS"],
  Reveal: parts["REVEAL_FIELDS"],
  Game: game["GAME_FIELDS"],
  PayoutTerms: game["PAYOUT_TERMS_FIELDS"],
  TermsNode: game["TERMS_NODE_FIELDS"],
  Amount: amount["AMOUNT_FIELDS"],
  DrawnRow: book["DRAWN_ROW_FIELDS"],
  BookTableRow: book["BOOK_TABLE_ROW_FIELDS"],
  BookVerification: book["BOOK_VERIFICATION_FIELDS"],
  KeyDelegationEvidence: delegation["KEY_DELEGATION_FIELDS"],
};

/**
 * The object schemas the page never reads as a body: `Problem` is an error's
 * body, and the page branches on the status only (V-9, V-10).
 */
const NOT_READ: readonly string[] = ["Problem"];

/**
 * Every `properties:` block nested inside a component schema (deeper than a
 * schema's own, at 6 spaces), as `schema@indent`.
 */
const nestedPropertiesBlocks = (): readonly string[] => {
  const components = document.slice(document.indexOf("\n  schemas:\n"));
  const found: string[] = [];
  let current = "";
  for (const line of components.split("\n")) {
    const name = /^ {4}([A-Za-z0-9]+):$/u.exec(line)?.[1];
    if (name !== undefined) current = name;
    const block = /^( +)properties:$/u.exec(line)?.[1];
    if (block !== undefined && block.length > 6) {
      found.push(`${current}@${String(block.length)}`);
    }
  }
  return found;
};

const keysOf = (fields: Fields | undefined): readonly string[] =>
  Object.keys(fields ?? {}).toSorted();

/** `KeyDelegationEvidence.domain`'s properties (12-space indent). */
const domainProperties = (): readonly string[] => {
  const text = schema("KeyDelegationEvidence");
  return propertiesAt(text.slice(text.indexOf("\n        domain:\n")), 10);
};

describe("the closed reader against the vendored verify API document", () => {
  it("reads every object schema the document defines, apart from `Problem`", () => {
    expect(objectSchemas().toSorted()).toEqual(
      [...Object.keys(READERS), ...NOT_READ].toSorted(),
    );
  });

  it.each(Object.keys(READERS))("names exactly `%s`'s properties", name => {
    expect(keysOf(READERS[name]).length).toBeGreaterThan(0);
    expect(keysOf(READERS[name])).toEqual(propertiesAt(schema(name), 6));
  });

  it("names exactly `KeyDelegationEvidence.domain`'s properties", () => {
    expect(domainProperties()).toEqual(["name", "version"]);
    expect(keysOf(delegation["KEY_DELEGATION_DOMAIN_FIELDS"])).toEqual(
      domainProperties(),
    );
  });

  it("finds a nested object only at `KeyDelegationEvidence.domain`", () => {
    // Any other nested object would need its own reader and its own case here.
    expect(nestedPropertiesBlocks()).toEqual(["KeyDelegationEvidence@10"]);
  });

  it("reads the properties block of a schema, and only that block", () => {
    expect(propertiesAt(schema("Amount"), 6)).toEqual([
      "amount",
      "currency",
      "decimals",
    ]);
    expect(propertiesAt(schema("RoundId"), 6)).toEqual([]);
  });
});

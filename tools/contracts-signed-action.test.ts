// The vendored `signed-action/` vectors sign the very action a `typed-data/`
// vector encodes, for the round of a `valid/` vector: each names both sources,
// and its `typedData` bytes and its EIP-712 message (`action`, `path`,
// `sequence`, `previous`, and `round`) are theirs. Its embedded test key is the
// public development key of `packages/signing/src/fixtures/keys.ts`, the only
// one the AGENTS.md exception allows, compared as text. A sync that brought one
// vector without the other, a pair that drifted apart, or another key fails
// here. The replay of the hashes and the signature is pending (#41).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");

const snapshotVectors = join(
  root,
  "packages",
  "contracts",
  "src",
  "vectors",
  "snapshot",
);

const readVector = (folder: string, name: string): unknown =>
  JSON.parse(
    readFileSync(join(snapshotVectors, folder, `${name}.json`), "utf8"),
  );

const signedActions = readdirSync(join(snapshotVectors, "signed-action"))
  .filter(file => file.endsWith(".json"))
  .map(file => file.slice(0, -".json".length))
  .toSorted();

/** `PLAYER_KEY` of signing's fixtures, read as text: tools import no package. */
const playerKey = (): string => {
  const text = readFileSync(
    join(root, "packages", "signing", "src", "fixtures", "keys.ts"),
    "utf8",
  );
  const key = /PLAYER_KEY =\s*"([0-9a-f]{64})"/u.exec(text)?.[1];
  if (key === undefined) throw new Error("PLAYER_KEY not found in keys.ts");
  return key;
};

type SignedAction = {
  readonly sources: { readonly round: string; readonly typedData: string };
  readonly typedData: unknown;
  readonly eip712: { readonly message: Readonly<Record<string, unknown>> };
  readonly testKey: { readonly privateKey: string };
};

type TypedData = {
  readonly fields: Readonly<Record<string, unknown>>;
  readonly typedData: unknown;
};

type ValidVector = { readonly input: { readonly roundId: string } };

/** The file name of the vector of `folder` that `source` names. */
const sourceName = (folder: string, source: string): string => {
  const match = /^snapshot\/([a-z-]+)\/([a-z0-9-]+)$/u.exec(source);
  if (match?.[1] !== folder || match[2] === undefined)
    throw new Error(`not a ${folder}/ vector: ${source}`);
  return match[2];
};

/** A UUID round id as EIP-712 `bytes32`: its 16 bytes, then 16 zero bytes. */
const roundBytes32 = (roundId: string): string =>
  `0x${roundId.replaceAll("-", "")}${"0".repeat(32)}`;

describe("the signed-action vectors", () => {
  it("are vendored", () => {
    expect(signedActions).toContain("coinflip-cancel");
  });

  it.each(signedActions)("%s signs its typed-data vector's action", name => {
    const signed = readVector("signed-action", name) as SignedAction;
    const typed = readVector(
      "typed-data",
      sourceName("typed-data", signed.sources.typedData),
    ) as TypedData;

    expect(signed.typedData).toEqual(typed.typedData);
    const { action, path, sequence, previous } = signed.eip712.message;
    expect({ action, path, sequence, previous }).toEqual({
      action: typed.fields["action"],
      path: typed.fields["path"],
      sequence: typed.fields["sequence"],
      previous: typed.fields["previous"],
    });
  });

  it.each(signedActions)("%s signs for its valid vector's round", name => {
    const signed = readVector("signed-action", name) as SignedAction;
    const round = readVector(
      "valid",
      sourceName("valid", signed.sources.round),
    ) as ValidVector;
    expect(signed.eip712.message["round"]).toBe(
      roundBytes32(round.input.roundId),
    );
  });

  it.each(signedActions)("%s embeds only signing's PLAYER_KEY", name => {
    const signed = readVector("signed-action", name) as SignedAction;
    expect(signed.testKey.privateKey).toBe(`0x${playerKey()}`);
  });
});

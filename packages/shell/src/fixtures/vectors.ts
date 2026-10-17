// Test-only: the vendored vectors the shell's tests read, through the
// `contracts` test-only entry: the signing vectors' domain and worked round,
// and Snapshot documents. The files are data of unknown shape, so every field
// used is checked first.

import {
  signingVectors,
  snapshotVectors,
} from "@intraverse/se-client-contracts/testing";
import type { Bytes32, Domain, Hex } from "@intraverse/se-client-signing";
import {
  type ValidSnapshot,
  validateSnapshot,
} from "@intraverse/se-client-snapshot";

type Json = Readonly<Record<string, unknown>>;

const record = (value: unknown, where: string): Json => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${where}: not an object`);
  }
  return value as Json;
};

const text = (parent: Json, key: string, where: string): string => {
  const value = parent[key];
  if (typeof value !== "string") throw new TypeError(`${where}.${key}`);
  return value;
};

const hex = (parent: Json, key: string, where: string): Hex => {
  const value = text(parent, key, where);
  if (!/^0x[0-9a-fA-F]*$/u.test(value)) throw new TypeError(`${where}.${key}`);
  return `0x${value.slice(2)}`;
};

const integer = (parent: Json, key: string, where: string): number => {
  const value = parent[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(`${where}.${key}`);
  }
  return value;
};

export type WorkedAction = {
  readonly kind: "action" | "cash-out";
  readonly action: string;
  readonly path: readonly number[];
  readonly sequence: number;
  readonly previous: Bytes32;
  readonly structHash: Bytes32;
  readonly digest: Bytes32;
};

const root = record(signingVectors, "signing");
const domainJson = record(root["domain"], "domain");
const newRound = record(root["newRound"], "newRound");

/** The signing vectors' EIP-712 domain. */
export const domain: Domain = {
  name: text(domainJson, "name", "domain"),
  version: text(domainJson, "version", "domain"),
  chainId: BigInt(integer(domainJson, "chainId", "domain")),
  verifyingContract: hex(domainJson, "verifyingContract", "domain"),
};

/** The worked round's `bytes32` round id. */
export const workedRound: Bytes32 = hex(newRound, "roundId", "newRound");

/** The worked round's `T_0` (the Ready evidence hash). */
export const workedInitial: Bytes32 = hex(root, "ready", "signing");

const actionsJson = root["actions"];
if (!Array.isArray(actionsJson)) throw new TypeError("actions");

/** The worked round's player messages, in order. */
export const workedActions: readonly WorkedAction[] = actionsJson.map(
  (value: unknown, index: number): WorkedAction => {
    const where = `actions[${index}]`;
    const entry = record(value, where);
    const kind = text(entry, "kind", where);
    const path = entry["path"];
    if (
      !Array.isArray(path) ||
      !path.every((step: unknown) => typeof step === "number")
    ) {
      throw new TypeError(`${where}.path`);
    }
    return {
      kind: kind === "CashOut" ? "cash-out" : "action",
      action: text(entry, "action", where),
      path: path as readonly number[],
      sequence: integer(entry, "sequence", where),
      previous: hex(entry, "previous", where),
      structHash: hex(entry, "structHash", where),
      digest: hex(entry, "digest", where),
    };
  },
);

/** A Snapshot `roundId` the tests use for their round. */
export const ROUND_ID = "01927c5e-8b3a-7f21-9c4d-5e6f7a8b9c0d";

/** Another round's id. */
export const OTHER_ROUND_ID = "01927c5e-8b3a-7f21-9c4d-000000000001";

const BASES = {
  idle: "coinflip-idle",
  starting: "coinflip-starting",
  active: "cashorcrash-active-row2",
  resolving: "cashorcrash-resolving-row2",
  won: "cashorcrash-won-cashout",
  lost: "cashorcrash-lost-row2",
  canceled: "coinflip-canceled",
} as const;

export type Status = keyof typeof BASES;

/**
 * A validated Snapshot of `status`, built from the golden vector of that status
 * with `roundId` and `step` replaced. Fails when the result is not valid, so a
 * test never reads an unvalidated document.
 */
export const snapshot = (
  status: Status,
  changes: { readonly roundId?: string; readonly step?: number } = {},
): ValidSnapshot => {
  const vector = record(snapshotVectors.valid[BASES[status]], status);
  const input: Record<string, unknown> = {
    ...record(vector["input"], `${status}.input`),
  };
  if (changes.roundId !== undefined) input["roundId"] = changes.roundId;
  if (changes.step !== undefined) input["step"] = changes.step;
  const result = validateSnapshot(input);
  if (!result.ok) throw new TypeError(`${status}: the fixture is not valid`);
  return result.value;
};

/**
 * A `signature/` vector: a valid Snapshot carrying `proofs.createRoundAuth`,
 * the pinned values and the shell's own inputs it is checked with, and the
 * verdict of the W-26 checks (`refuse` names the failing check's reason).
 */
export type SignatureVector = {
  readonly name: string;
  readonly verdict: "accept" | "refuse";
  readonly reason: string | undefined;
  readonly pinned: Json;
  readonly shell: Json;
  readonly snapshot: ValidSnapshot;
};

/** Every `signature/` vector, read and validated. */
export const signatureVectors: readonly SignatureVector[] = Object.entries(
  snapshotVectors.signature,
).map(([name, file]): SignatureVector => {
  const vector = record(file, name);
  const verdict = text(vector, "verdict", name);
  if (verdict !== "accept" && verdict !== "refuse") {
    throw new TypeError(`${name}.verdict`);
  }
  const reason = vector["reason"];
  if (reason !== undefined && typeof reason !== "string") {
    throw new TypeError(`${name}.reason`);
  }
  const result = validateSnapshot(vector["input"]);
  if (!result.ok) throw new TypeError(`${name}: the input is not valid`);
  return {
    name,
    verdict,
    reason,
    pinned: record(vector["pinned"], `${name}.pinned`),
    shell: record(vector["shell"], `${name}.shell`),
    snapshot: result.value,
  };
});

/**
 * A deep copy of a vendored Snapshot vector's `input`, by its set and name, for
 * a test to change before it validates it.
 */
export const vectorInput = (
  set: "valid" | "signature",
  name: string,
): Record<string, unknown> => {
  const vectors: Readonly<Record<string, unknown>> = snapshotVectors[set];
  const vector = record(vectors[name], name);
  return structuredClone(record(vector["input"], `${name}.input`));
};

/** `input` validated, or a thrown error: a test never reads it unvalidated. */
export const validated = (input: unknown): ValidSnapshot => {
  const result = validateSnapshot(input);
  if (!result.ok) {
    throw new TypeError(
      `not a valid Snapshot: ${result.issues.map(i => i.instancePath).join(", ")}`,
    );
  }
  return result.value;
};

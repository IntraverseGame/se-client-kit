// The few facts the preview specs read from a Snapshot response and from the
// verify API's answer, as they arrive from the real stack. A body is untrusted
// here as it is everywhere: each reader returns `undefined` for a body that is
// not what it needs, never throws, and never logs. Every amount is a string in
// the wire and a `bigint` here, never a JS `number`.

export type PayoutFacts = {
  /** Base units, as a `bigint`. */
  readonly value: bigint;
  readonly unit: string;
  readonly formatted: string;
};

export type SnapshotFacts = {
  readonly version: number;
  readonly status: string;
  readonly roundId: string | undefined;
  readonly payout: PayoutFacts | undefined;
};

export type VerificationFacts = {
  readonly roundId: string;
  readonly status: string;
  /** `payout.amount` in base units and its currency, when the answer has one. */
  readonly payout:
    | { readonly amount: bigint; readonly currency: string }
    | undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const BASE_UNITS = /^(?:0|[1-9]\d*)$/u;

const baseUnits = (value: unknown): bigint | undefined =>
  typeof value === "string" && BASE_UNITS.test(value)
    ? BigInt(value)
    : undefined;

const payoutOf = (value: unknown): PayoutFacts | undefined => {
  if (!isRecord(value)) return undefined;
  const units = baseUnits(value["value"]);
  const { unit, formatted } = value;
  return units !== undefined &&
    typeof unit === "string" &&
    typeof formatted === "string"
    ? { value: units, unit, formatted }
    : undefined;
};

/** The facts of a Snapshot body, or `undefined` when it is not one. */
export const snapshotFacts = (body: unknown): SnapshotFacts | undefined => {
  if (!isRecord(body)) return undefined;
  const { version, status, roundId } = body;
  if (
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    typeof status !== "string"
  ) {
    return undefined;
  }
  return {
    version,
    status,
    roundId: typeof roundId === "string" ? roundId : undefined,
    payout: payoutOf(body["payout"]),
  };
};

/** The facts of the verify API's `RoundVerification`, or `undefined`. */
export const verificationFacts = (
  body: unknown,
): VerificationFacts | undefined => {
  if (!isRecord(body)) return undefined;
  const { roundId, status, payout } = body;
  if (typeof roundId !== "string" || typeof status !== "string") {
    return undefined;
  }
  if (payout === undefined) return { roundId, status, payout: undefined };
  if (!isRecord(payout)) return undefined;
  const amount = baseUnits(payout["amount"]);
  const { currency } = payout;
  return amount !== undefined && typeof currency === "string"
    ? { roundId, status, payout: { amount, currency } }
    : undefined;
};

/** The `playToken` of a `sessions:redeem` body, to register as a needle. */
export const playTokenOf = (body: unknown): string | undefined =>
  isRecord(body) && typeof body["playToken"] === "string"
    ? body["playToken"]
    : undefined;

/**
 * Whether a payout of the Snapshot and the verify API's agree: the same base
 * units and the same currency; both absent counts as zero on both sides.
 */
export const payoutsAgree = ({
  snapshot,
  verification,
}: {
  readonly snapshot: PayoutFacts | undefined;
  readonly verification: VerificationFacts["payout"];
}): boolean => {
  if (snapshot === undefined || verification === undefined) {
    return (snapshot?.value ?? 0n) === (verification?.amount ?? 0n);
  }
  return (
    snapshot.value === verification.amount &&
    snapshot.unit === verification.currency
  );
};

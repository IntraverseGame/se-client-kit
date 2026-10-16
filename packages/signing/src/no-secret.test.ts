// No key material in an error, a serialization, or a log call (AC4, W-10).

import { describe, expect, it, vi } from "vitest";

import {
  actionVector,
  caught,
  playerSigner,
  separator,
} from "./fixtures/helpers.ts";
import { PLAYER_KEY, scriptedRandom } from "./fixtures/keys.ts";
import { vectors } from "./fixtures/vectors.ts";
import { recoverAddress } from "./signature.ts";
import { createSigner } from "./signer.ts";
import { createTranscript } from "./transcript.ts";

const keyBytes = Array.from({ length: 32 }, (_, i) =>
  Number.parseInt(PLAYER_KEY.slice(i * 2, i * 2 + 2), 16),
);

// Every spelling of the key a careless serialization could produce.
const SPELLINGS = [
  PLAYER_KEY,
  PLAYER_KEY.toUpperCase(),
  keyBytes.join(","),
  keyBytes.join(", "),
  BigInt(`0x${PLAYER_KEY}`).toString(),
  Buffer.from(PLAYER_KEY, "hex").toString("base64"),
];

/** The spellings of the key found in `texts`; empty when none leaks. */
const leaks = (texts: readonly string[]): string[] =>
  SPELLINGS.filter(spelling => texts.some(text => text.includes(spelling)));

const renderError = (error: unknown): string[] =>
  error instanceof Error
    ? [
        error.message,
        error.stack ?? "",
        String(error),
        JSON.stringify(error),
        JSON.stringify(Object.getOwnPropertyDescriptors(error)),
        String(error.cause),
      ]
    : [String(error)];

const LOG_METHODS = ["log", "info", "warn", "error", "debug", "trace"] as const;

/**
 * Run `work` with every console method replaced; return how many log calls it
 * made.
 */
const logCalls = (work: () => void): number => {
  const spies = LOG_METHODS.map(method =>
    vi.spyOn(console, method).mockImplementation(() => null),
  );
  try {
    work();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  return spies.reduce((total, spy) => total + spy.mock.calls.length, 0);
};

/**
 * Every error the key's users throw, while the key is held and after it is
 * destroyed.
 */
const errorsWhileKeyInUse = (): unknown[] => {
  const signer = playerSigner();
  const transcript = createTranscript({
    domainSeparator: separator,
    round: vectors.roundId,
    initial: vectors.ready,
  });
  transcript.sign({ kind: "action", action: "a", path: [] }, signer.sign);
  const errors = [
    caught(() => signer.sign("0x1234")),
    caught(() => signer.sign(`0x${PLAYER_KEY}0`)),
    caught(() =>
      createTranscript({
        domainSeparator: `0x${PLAYER_KEY}`,
        round: "0x12",
        initial: vectors.ready,
      }),
    ),
    caught(() =>
      transcript.sign(
        { kind: "action", action: PLAYER_KEY, path: [] },
        signer.sign,
      ),
    ),
  ];
  signer.destroy();
  errors.push(caught(() => signer.sign(vectors.ready)));
  return errors;
};

describe("key material", () => {
  it("never appears in a serialization of the signer", () => {
    const signer = playerSigner();
    expect(
      leaks([
        JSON.stringify(signer),
        String(signer),
        `${signer}`,
        JSON.stringify(Object.getOwnPropertyDescriptors(signer)),
        Object.keys(signer).join(","),
      ]),
    ).toEqual([]);
    expect(Object.keys(signer).toSorted()).toEqual([
      "address",
      "destroy",
      "sign",
      "toJSON",
      "toString",
    ]);
  });

  it("never appears in an error thrown while the key is in use", () => {
    const errors = errorsWhileKeyInUse();
    expect(errors).toHaveLength(5);
    expect(leaks(errors.flatMap(error => renderError(error)))).toEqual([]);
  });

  it("never appears in an error from a bad random source", () => {
    const draws = Array.from({ length: 16 }, () => "00".repeat(32));
    const error = caught(() =>
      createSigner({ random: scriptedRandom(...draws) }),
    );
    expect(leaks(renderError(error))).toEqual([]);
  });

  it("is never logged: signing, recovering, and failing make no log call", () => {
    expect(
      logCalls(() => {
        errorsWhileKeyInUse();
        playerSigner().sign(vectors.ready);
        const { digest, signature } = actionVector(0);
        recoverAddress(digest, signature);
        caught(() => recoverAddress(digest, signature.slice(0, 130)));
      }),
    ).toBe(0);
  });
});

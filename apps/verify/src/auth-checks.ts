// Checks 1 to 4 of V-12 over the fetched evidence: the round id, the entropy
// target, the backend's signature, and the ready evidence. They use `signing`
// for every keccak256 hash and the signature recovery, and the environment
// configuration as the only trust anchor (OQ-7): the evidence's domain, signer,
// and entropy chain id are compared with it, and every digest is built with the
// configured values, never one taken from the evidence.

import {
  type Bytes32,
  domainSeparator,
  hashCreateRoundAuth,
  hashNewRound,
  hashRandomnessTarget,
  hashReady,
  recoverAddress,
  SigningError,
  typedDataDigest,
} from "@intraverse/se-client-signing";

import { asciiBytes32 } from "./ascii-bytes32.ts";
import {
  type CheckResult,
  compare,
  type Detail,
  settled,
} from "./check-result.ts";
import type { VerifyConfig } from "./environment-config.ts";
import type {
  CreateRoundAuthEvidence,
  RoundEvidence,
} from "./round-evidence.ts";
import { roundIdBytes32 } from "./round-id.ts";

// The registry domain's fixed name and version (the Snapshot schema's constants).
const DOMAIN_NAME = "SuperEngine";
const DOMAIN_VERSION = "1";
const NO_AUTH = "The round carries no createRoundAuth.";
const NO_ENTROPY = "The round carries no entropy block yet.";

const lower = (value: string | undefined): string | undefined =>
  value?.toLowerCase();

/** Check 1: the round id, in the body and in `newRound`. */
export const checkRoundId = (
  evidence: RoundEvidence,
  asked: string,
): CheckResult =>
  settled(
    1,
    [
      compare("roundId", asked, evidence.roundId),
      compare(
        "newRound.roundId",
        roundIdBytes32(asked),
        evidence.createRoundAuth?.newRound.roundId,
      ),
    ],
    evidence.createRoundAuth === undefined ? { note: NO_AUTH } : {},
  );

/** Check 2: `randomnessTarget` from the source, the pinned chain, and block N. */
export const checkEntropyTarget = (
  evidence: RoundEvidence,
  config: VerifyConfig,
): CheckResult => {
  const auth = evidence.createRoundAuth;
  if (evidence.randomnessProof === undefined) {
    return {
      ...settled(2, [
        compare(
          "newRound.randomnessTarget",
          undefined,
          auth?.newRound.randomnessTarget,
        ),
      ]),
      note: NO_ENTROPY,
    };
  }
  const { source, blockNumber } = evidence.randomnessProof;
  const pinned = Object.hasOwn(config.sources, source)
    ? config.sources[source]
    : undefined;
  const word = asciiBytes32(source);
  const target =
    pinned === undefined || word === undefined
      ? undefined
      : hashRandomnessTarget({
          source: word,
          entropyChainId: BigInt(pinned.chainId),
          blockNumber,
        });
  return settled(
    2,
    [
      compare(
        "entropyChainId",
        pinned === undefined ? undefined : String(pinned.chainId),
        auth === undefined ? undefined : String(auth.entropyChainId),
      ),
      compare(
        "newRound.randomnessTarget",
        target,
        auth?.newRound.randomnessTarget,
      ),
    ],
    {
      note:
        pinned === undefined
          ? "The configuration does not list this entropy source."
          : auth === undefined
            ? NO_AUTH
            : undefined,
      details: [{ label: "block number", value: blockNumber.toString() }],
    },
  );
};

type Created = {
  readonly created: Bytes32 | undefined;
  readonly recovered: string | undefined;
  readonly refusal: string | undefined;
};

/**
 * `created`, and the signer the signature recovers to, under the configured
 * domain.
 */
const recoverSigner = (
  config: VerifyConfig,
  auth: CreateRoundAuthEvidence,
): Created => {
  const { newRound } = auth;
  const currency = asciiBytes32(newRound.currency);
  if (currency === undefined) {
    return { created: undefined, recovered: undefined, refusal: "currency" };
  }
  try {
    const created = hashNewRound({
      ...newRound,
      roundId: newRound.roundId as Bytes32,
      playerRef: newRound.playerRef as Bytes32,
      currency,
      roundSecretHash: newRound.roundSecretHash as Bytes32,
      randomnessTarget: newRound.randomnessTarget as Bytes32,
      actionKey: newRound.actionKey as `0x${string}`,
      payoutTermsHash: newRound.payoutTermsHash as Bytes32,
    });
    const digest = typedDataDigest(
      domainSeparator({
        name: DOMAIN_NAME,
        version: DOMAIN_VERSION,
        chainId: config.registryDomain.chainId,
        verifyingContract: config.registryDomain.verifyingContract,
      }),
      hashCreateRoundAuth({
        created,
        prepareWindow: auth.prepareWindow,
        expiry: auth.expiry,
      }),
    );
    try {
      // Refuses a signature that is not canonical and the zero address.
      const recovered = recoverAddress(digest, auth.signature);
      return {
        created,
        recovered: recovered.toLowerCase(),
        refusal: undefined,
      };
    } catch (error) {
      const code = error instanceof SigningError ? error.code : "invalid";
      return { created, recovered: undefined, refusal: code };
    }
  } catch {
    return { created: undefined, recovered: undefined, refusal: "newRound" };
  }
};

/**
 * Check 3: the pinned domain and signer, the signature recovering to the
 * configured signer over `created`, and the signed commitment equal to the
 * randomness proof's. Returns `created` too, for check 4.
 *
 * A-4 (specs/verify-page.md, decided 2026-10-20): `newRound.actionKey` is
 * compared with nothing, and is shown as not checked (V-13). The page has no
 * player key, so it cannot make the shell's cross-field check (the
 * `create-round-auth-action-key` vector passes here).
 */
export const checkSignature = (
  evidence: RoundEvidence,
  config: VerifyConfig,
): { readonly result: CheckResult; readonly created: Bytes32 | undefined } => {
  const auth = evidence.createRoundAuth;
  if (auth === undefined) {
    return {
      result: {
        ...settled(3, [compare("createRoundAuth", "present")]),
        note: NO_AUTH,
      },
      created: undefined,
    };
  }
  const { created, recovered, refusal } = recoverSigner(config, auth);
  const details: Detail[] =
    created === undefined ? [] : [{ label: "created", value: created }];
  return {
    created,
    result: settled(
      3,
      [
        compare(
          "domain.chainId",
          config.registryDomain.chainId.toString(),
          String(auth.domain.chainId),
        ),
        compare(
          "domain.verifyingContract",
          config.registryDomain.verifyingContract,
          lower(auth.domain.verifyingContract),
        ),
        compare("signer", config.runtimeSigner, lower(auth.signer)),
        compare(
          "signature recovers to the configured signer",
          recovered,
          config.runtimeSigner,
        ),
        compare(
          "newRound.roundSecretHash",
          auth.newRound.roundSecretHash,
          evidence.randomnessProof?.roundSecretHash,
        ),
      ],
      {
        details,
        note:
          refusal === undefined
            ? undefined
            : `The signature or a signed field was refused (${refusal}).`,
      },
    ),
  };
};

/** Check 4: `readyHash` is `keccak256(abi.encode(created, seedHash))`. */
export const checkReadyEvidence = (
  evidence: RoundEvidence,
  created: Bytes32 | undefined,
): CheckResult => {
  const proof = evidence.fairnessProof;
  const ready =
    created === undefined || proof === undefined
      ? undefined
      : hashReady({ created, seedHash: proof.seedHash as Bytes32 });
  return settled(
    4,
    [compare("fairnessProof.readyHash", ready, proof?.readyHash)],
    {
      note:
        proof === undefined
          ? "The round carries no fairnessProof."
          : created === undefined
            ? "`created` could not be recomputed (check 3)."
            : undefined,
    },
  );
};

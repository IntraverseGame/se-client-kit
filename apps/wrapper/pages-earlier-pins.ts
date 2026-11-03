// `earlierPins` in `PAGES_CHAIN_PINS` (V-3b in specs/verify-page.md; the verifier's
// document only, specs/client-kit.md, The Pages sites' configuration): what is
// wrong with the list, for pages-config.ts to fail the job on. Pure.

import { validateEnvironmentConfig } from "./src/environment-config.ts";

type Document = Record<string, unknown>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether `record` holds exactly `fields`, and no other. */
const hasExactly = (
  record: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): boolean =>
  Object.keys(record).length === fields.length &&
  fields.every(field => Object.hasOwn(record, field));

/** Whether an `earlierPins` entry has exactly the fields of a pair. */
const isPairShaped = (entry: unknown): entry is Document =>
  isRecord(entry) &&
  hasExactly(entry, ["registryDomain", "runtimeSigner"]) &&
  isRecord(entry["registryDomain"]) &&
  hasExactly(entry["registryDomain"], ["chainId", "verifyingContract"]);

/** A pair as one text, without address case; `undefined` when malformed. */
const pairKey = (pair: Document): string | undefined => {
  const domain = pair["registryDomain"];
  const signer = pair["runtimeSigner"];
  if (!isRecord(domain)) return undefined;
  const { chainId, verifyingContract } = domain;
  return typeof chainId === "number" &&
    typeof verifyingContract === "string" &&
    typeof signer === "string"
    ? `${String(chainId)} ${verifyingContract} ${signer}`.toLowerCase()
    : undefined;
};

/**
 * What is wrong with `earlierPins`, naming an entry by its index and never a
 * value. An entry's values are put through the Wrapper's validator in the
 * current pair's place, so an earlier pair is under the current pair's rule.
 */
export const earlierPinIssues = (
  earlierPins: unknown,
  document: Document,
  origin: string,
): readonly string[] => {
  if (earlierPins === undefined) return [];
  if (!Array.isArray(earlierPins)) {
    return ["PAGES_CHAIN_PINS: earlierPins is not a list"];
  }
  const current = pairKey(document);
  const seen = new Set<string | undefined>();
  const issues: string[] = [];
  for (const [index, entry] of (earlierPins as readonly unknown[]).entries()) {
    const name = `PAGES_CHAIN_PINS: earlierPins entry ${String(index)}`;
    if (!isPairShaped(entry)) {
      issues.push(
        `${name} is not exactly a registryDomain and a runtimeSigner`,
      );
      continue;
    }
    const result = validateEnvironmentConfig({ ...document, ...entry }, origin);
    const refused = result.ok
      ? []
      : result.issues.filter(
          issue =>
            issue.code === "invalid-signer" || issue.code === "invalid-domain",
        );
    if (refused.length > 0) {
      issues.push(
        ...refused.map(issue => `${name}: ${issue.code} at ${issue.field}`),
      );
      continue;
    }
    const key = pairKey(entry);
    if (key === current) issues.push(`${name} is the current pair`);
    else if (seen.has(key)) issues.push(`${name} repeats another entry`);
    seen.add(key);
  }
  return issues;
};

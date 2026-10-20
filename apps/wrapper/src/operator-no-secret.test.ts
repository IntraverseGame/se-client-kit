// T-9a, 10: what the operator page receives holds no secret. A property test
// over recorded sessions: a framed Wrapper, its handshake accepted, is shown
// every golden Snapshot (the `valid/` and `signature/` vectors) in turn, with
// repeated hellos and seeded heights between them. Every message posted to the
// parent is `welcome` or `resize` with exactly its fields, to the operator
// origin, and none holds a value of a Snapshot's ids, amounts, links, or
// proofs. The action key, the play token, and the launch code are kept out by
// structure (the operator channel is given none of them, and nothing it posts
// is built from the session) and by the e2e scans of what the fake operator
// page received (t9a-navigations, t9a-operator-round).

import { snapshotVectors } from "@intraverse/se-client-contracts/testing";
import type { SessionRead } from "@intraverse/se-client-shell";
import { describe, expect, it } from "vitest";

import { flush } from "./fixtures/flush.ts";
import {
  bootFramed,
  HELLO,
  OPERATOR,
  type Posted,
} from "./fixtures/framed-boot.ts";

const ignore = (): void => {};

/** Every string leaf of a value. */
const strings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(item => strings(item));
};

const isSnapshotFile = (
  file: unknown,
): file is { readonly definition: string; readonly input: unknown } =>
  typeof file === "object" &&
  file !== null &&
  (file as { definition?: unknown }).definition === "Snapshot";

const GOLDEN: readonly unknown[] = [
  snapshotVectors.valid,
  snapshotVectors.signature,
].flatMap(set =>
  Object.values(set)
    .filter(file => isSnapshotFile(file))
    .map(file => file.input),
);

/** The Snapshots' values long enough to be an id, an amount, a link, a proof. */
const NEEDLES: readonly string[] = [
  ...new Set(GOLDEN.flatMap(snapshot => strings(snapshot))),
].filter(
  leaf => leaf.length >= 8 && leaf !== "se.operator/1" && leaf !== "welcome",
);

/** A post is `welcome` or `resize` with exactly its fields, to OPERATOR. */
const isOperatorPost = ({ message, targetOrigin }: Posted): boolean => {
  const record = message as Readonly<Record<string, unknown>>;
  const keys = Object.keys(record).toSorted().join();
  const shaped =
    record["type"] === "resize"
      ? keys === "height,schema,type" && Number.isInteger(record["height"])
      : keys === "schema,type" && record["type"] === "welcome";
  return (
    targetOrigin === OPERATOR && record["schema"] === "se.operator/1" && shaped
  );
};

const leaks = (posts: readonly Posted[]): readonly string[] => {
  const text = JSON.stringify(posts.map(post => post.message));
  return NEEDLES.filter(needle => text.includes(needle));
};

describe("no secret reaches the operator page (T-9a, 10)", () => {
  it("over every golden Snapshot, only welcome and resize, with no Snapshot value", async () => {
    let report: (height: number) => void = ignore;
    const framed = bootFramed({
      heights: next => {
        report = next;
      },
    });
    framed.send(HELLO);
    await framed.releaseConfig();
    await framed.result;
    expect(GOLDEN.length).toBeGreaterThan(20);
    let height = 100;
    for (const snapshot of GOLDEN) {
      framed.session.change({ kind: "snapshot", snapshot } as SessionRead);
      framed.send(HELLO);
      height = (height * 7 + 13) % 3000;
      report(height);
    }
    await flush();
    expect(framed.posted.length).toBeGreaterThan(GOLDEN.length);
    expect(framed.posted.filter(post => !isOperatorPost(post))).toEqual([]);
    expect(leaks(framed.posted)).toEqual([]);
  });
});

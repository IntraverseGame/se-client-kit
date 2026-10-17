// T-9, the allow-list (W-38): a property test over recorded sessions. Each
// seeded session forwards every golden Snapshot (the `valid/` and `signature/`
// vectors, so `proofs.createRoundAuth` is in play), mixed with legal picks,
// illegal picks, malformed and forged messages, and use-case outcomes. Every
// message the game receives must hold only allow-listed fields, go to D, and
// carry no proof, signature, session id, link, or amount.

import { snapshotVectors } from "@intraverse/se-client-contracts/testing";
import {
  type ValidSnapshot,
  validateSnapshot,
} from "@intraverse/se-client-snapshot";
import { describe, expect, it } from "vitest";

import { CONTROLLER_SCHEMA } from "./controller-protocol.ts";
import {
  action,
  createFakeGame,
  GAME_ORIGIN,
  HELLO,
  mount,
} from "./fixtures/fake-game.ts";
import { seededInts } from "./fixtures/seeded.ts";

const SNAPSHOT_FIELDS = [
  "schema",
  "type",
  "snapshot",
  "snapshot.version",
  "snapshot.presentation",
  "snapshot.status",
  "snapshot.closeReason",
  "snapshot.roundId",
  "snapshot.step",
  "snapshot.currentMultiplier",
  "snapshot.context",
  "snapshot.context.language",
  "snapshot.context.device",
  "snapshot.context.theme",
  "snapshot.context.theme.appearance",
  "snapshot.config",
  "snapshot.config.kind",
  "snapshot.config.steps",
  "snapshot.config.steps[]",
  "snapshot.config.steps[].index",
  "snapshot.config.steps[].optionCount",
  "snapshot.config.steps[].multiplier",
  "snapshot.config.steps[].selectedIndex",
  "snapshot.config.steps[].losingIndex",
];
const REJECT_FIELDS = ["schema", "type", "id", "reason"];
const ALLOWED: ReadonlySet<string> = new Set([
  ...SNAPSHOT_FIELDS,
  ...REJECT_FIELDS,
]);

/** Every field path of a JSON value, array items as `[]`. */
const paths = (value: unknown, prefix = ""): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap(item =>
      [`${prefix}[]`].concat(paths(item, `${prefix}[]`)),
    );
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => {
      const path = prefix === "" ? key : `${prefix}.${key}`;
      return [path].concat(paths(item, path));
    });
  }
  return [];
};

/** The fields of a message outside the allow-list of its own type. */
const outsideItsType = (message: unknown): readonly string[] => {
  const { type } = message as { readonly type: unknown };
  const allowed = type === "reject" ? REJECT_FIELDS : SNAPSHOT_FIELDS;
  return paths(message).filter(path => !allowed.includes(path));
};

type VectorFile = { readonly definition?: unknown; readonly input?: unknown };

/** The vectors of a group whose definition is `Snapshot`. */
const snapshotFiles = (
  files: Readonly<Record<string, unknown>>,
): [string, VectorFile][] =>
  Object.entries(files)
    .map(([name, file]): [string, VectorFile] => [name, file as VectorFile])
    .filter(([, file]) => file.definition === "Snapshot");

/** Each Snapshot vector's input, validated; one that fails throws. */
const inputs = (
  group: string,
  files: Readonly<Record<string, unknown>>,
): ValidSnapshot[] =>
  snapshotFiles(files).map(([name, file]) => {
    const result = validateSnapshot(file.input);
    if (!result.ok) throw new TypeError(`${group}/${name} does not validate`);
    return result.value;
  });

const pool: readonly ValidSnapshot[] = [
  ...inputs("valid", snapshotVectors.valid),
  ...inputs("signature", snapshotVectors.signature),
];

/** Text that must never reach the game, collected from the pool itself. */
const forbidden: readonly string[] = [
  ...new Set(
    pool.flatMap(s => {
      const auth = s.proofs?.createRoundAuth;
      return [
        s.context.sessionId,
        ...Object.values(s.context.links ?? {}),
        ...(auth === undefined ? [] : [auth.signature, auth.signer]),
        ...(auth === undefined ? [] : [auth.newRound.actionKey]),
        s.bet.balance.formatted,
      ];
    }),
  ),
];

const SESSIONS = 25;
const EVENTS = 120;

type Recorded = {
  readonly messages: readonly unknown[];
  readonly picks: number;
};

const recordSession = async (seed: number): Promise<Recorded> => {
  const next = seededInts(seed);
  const game = createFakeGame();
  const bridge = mount(game);
  let version = 0;
  let settled = 0;
  let current: ValidSnapshot | undefined;
  game.send(HELLO);
  for (let event = 0; event < EVENTS; event += 1) {
    const choice = next(7);
    if (choice <= 1) {
      const chosen = pool[next(pool.length)];
      if (chosen === undefined) throw new Error("empty pool");
      version += 1;
      current = { ...chosen, version } as ValidSnapshot;
      bridge.sendSnapshot(current);
    } else if (choice === 2) {
      game.send(action(`legal-${event}`, current?.step ?? 0, next(2)));
    } else if (choice === 3) {
      game.send(action(`any-${event}`, next(4), next(5)));
    } else if (choice === 4) {
      game.send({ ...action(`bad-${event}`, 0, 0), verb: "cashOut" });
      game.send({ ...action(`extra-${event}`, 0, 0), token: "x" });
      game.send({ schema: CONTROLLER_SCHEMA, type: "deposit" });
    } else if (choice === 5) {
      game.send(action(`forged-${event}`, 0, 0), { source: {} });
    } else if (game.picks.length > settled) {
      settled += 1;
      // oxlint-disable-next-line no-await-in-loop -- each event follows the one before
      await game.settle(
        next(2) === 0
          ? { accepted: true }
          : { accepted: false, reason: "not_active" },
      );
    }
  }
  for (const { targetOrigin } of game.posted) {
    expect(targetOrigin).toBe(GAME_ORIGIN);
  }
  return {
    messages: game.posted.map(p => p.message),
    picks: game.picks.length,
  };
};

describe("the game receives only allow-listed fields (T-9)", () => {
  it("the pool is every valid/ and signature/ Snapshot vector, each validated", () => {
    const valid = snapshotFiles(snapshotVectors.valid).length;
    const signature = snapshotFiles(snapshotVectors.signature).length;
    // Every signature/ vector is a Snapshot; none is skipped.
    expect(signature).toBe(Object.keys(snapshotVectors.signature).length);
    expect(valid).toBeGreaterThan(0);
    expect(signature).toBeGreaterThan(0);
    expect(pool).toHaveLength(valid + signature);
  });

  it("the pool holds createRoundAuth, links, and session ids to leak", () => {
    expect(pool.some(s => s.proofs?.createRoundAuth !== undefined)).toBe(true);
    expect(pool.some(s => s.context.links !== undefined)).toBe(true);
    expect(forbidden.length).toBeGreaterThan(3);
  });

  it("over recorded sessions, every message is allow-listed", async () => {
    const types = new Set<unknown>();
    let picks = 0;
    for (let seed = 1; seed <= SESSIONS; seed += 1) {
      // oxlint-disable-next-line no-await-in-loop -- one session per seed, in order
      const recorded = await recordSession(seed);
      picks += recorded.picks;
      const { messages } = recorded;
      for (const message of messages) {
        expect(paths(message).filter(path => !ALLOWED.has(path))).toEqual([]);
        expect(outsideItsType(message)).toEqual([]);
        types.add((message as { readonly type: unknown }).type);
        const text = JSON.stringify(message);
        for (const secret of forbidden) {
          expect(text).not.toContain(secret);
        }
        expect(text).not.toMatch(/0x[0-9a-fA-F]{40}/u);
      }
    }
    expect([...types].toSorted()).toEqual(["reject", "snapshot"]);
    // The sessions reached the use case, not only the refusals.
    expect(picks).toBeGreaterThan(0);
  });

  it("a playback Snapshot is not forwarded", () => {
    const playback = pool.filter(s => s.presentation === "playback");
    expect(playback.length).toBeGreaterThan(0);
    const game = createFakeGame();
    const bridge = mount(game);
    game.send(HELLO);
    for (const s of playback) bridge.sendSnapshot(s);
    expect(game.posted).toEqual([]);
  });
});

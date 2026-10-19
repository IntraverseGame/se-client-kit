// Boot opens the session only once the configuration is accepted, with that
// configuration, and shows what the opening led to; a refused configuration
// opens nothing (W-1a, W-26a), and an opening that throws signs nothing. Boot
// that opens no session discards the launch code, once; boot that opens one
// leaves it to the session. The operator gate's cases (W-49a to W-49d) are in
// operator-gate.test.ts.

import {
  createLogger,
  type LogRecord,
  type SessionOpening,
} from "@intraverse/se-client-shell";
import { describe, expect, it } from "vitest";

import { boot } from "./boot.ts";
import type { EmbeddingContext } from "./embedding.ts";
import type { EnvironmentConfig } from "./environment-config.ts";
import { environmentDocument } from "./fixtures/environment.ts";
import { createFakeSession, snapshotRead } from "./fixtures/fake-session.ts";
import { manualTimers } from "./fixtures/manual-timers.ts";
import { messagesFor } from "./messages.ts";

const m = messagesFor("en").messages;

const TOP: EmbeddingContext = {
  framed: false,
  nested: false,
  ancestorOrigins: [],
};

const records: LogRecord[] = [];
/** How often boot discarded the launch code. */
let discarded = 0;

const bootWith = (
  document_: unknown,
  openSession: (config: EnvironmentConfig) => Promise<SessionOpening>,
): ReturnType<typeof boot> => {
  records.length = 0;
  discarded = 0;
  document.body.replaceChildren();
  const host = document.createElement("div");
  document.body.append(host);
  return boot({
    doc: document,
    host,
    timers: manualTimers(),
    fetch: () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(document_),
      }),
    configUrl: "https://se.example/environment-config.json",
    logger: createLogger(record => {
      records.push(record);
    }),
    window: {
      addEventListener: () => {},
      removeEventListener: () => {},
      origin: "https://se.example",
    },
    embedding: TOP,
    openSession,
    discardLaunchCode: () => {
      discarded += 1;
    },
  });
};

describe("boot opens the session", () => {
  it("with the accepted configuration, and connects it", async () => {
    const fake = createFakeSession();
    fake.reads.push(snapshotRead("coinflip-idle"));
    const configs: EnvironmentConfig[] = [];
    const result = await bootWith(environmentDocument(), config => {
      configs.push(config);
      return Promise.resolve({ kind: "open", session: fake.session });
    });
    expect(result.kind).toBe("configured");
    expect(configs.map(config => config.playApiBaseUrl)).toEqual([
      environmentDocument()["playApiBaseUrl"],
    ]);
    expect(result).toMatchObject({ kind: "configured", session: fake.session });
    expect(discarded).toBe(0);
  });

  it("never with a refused configuration", async () => {
    let opened = 0;
    const result = await bootWith({ environment: "nowhere" }, () => {
      opened += 1;
      return Promise.resolve({ kind: "no-launch-code" });
    });
    expect(result.kind).toBe("refused");
    expect(opened).toBe(0);
    // The code is never redeemed: it is forgotten (W-1).
    expect(discarded).toBe(1);
  });

  it("shows the session-ended state when there is no launch code", async () => {
    const result = await bootWith(environmentDocument(), () =>
      Promise.resolve({ kind: "no-launch-code" }),
    );
    expect(result.app.state().blocking).toBe("session-ended");
    expect(document.body.textContent).toContain(m["state.sessionEnded"]);
  });

  it("shows the session-ended state when opening throws", async () => {
    const result = await bootWith(environmentDocument(), () =>
      Promise.reject(new TypeError("no")),
    );
    expect(result.app.state().blocking).toBe("session-ended");
  });
});

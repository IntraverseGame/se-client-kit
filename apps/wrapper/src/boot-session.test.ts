// Boot opens the session only once the configuration is accepted, with that
// configuration, and shows what the opening led to; a refused configuration
// opens nothing (W-1a, W-26a), and an opening that throws signs nothing. A
// framed Wrapper opens a session only under W-49's minimum (embedding.ts):
// otherwise it shows the configuration-error state, logs the reason code
// only, and opens nothing. Boot that opens no session discards the launch
// code, once; boot that opens one leaves it to the session.

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

const TOP: EmbeddingContext = { framed: false, ancestorOrigins: [] };
const OPERATOR = "https://operator.example";

const records: LogRecord[] = [];
/** How often boot discarded the launch code. */
let discarded = 0;

/** How the page is framed: `{}` when the framing is unknown. */
type Framing = { readonly embedding?: EmbeddingContext };

const AT_TOP: Framing = { embedding: TOP };

/** An opening that counts its calls and opens a scripted session. */
const counting = (): {
  readonly open: () => Promise<SessionOpening>;
  readonly opened: () => number;
} => {
  let opened = 0;
  const fake = createFakeSession();
  return {
    open: () => {
      opened += 1;
      return Promise.resolve({ kind: "open", session: fake.session });
    },
    opened: () => opened,
  };
};

const bootWith = (
  document_: unknown,
  openSession: (config: EnvironmentConfig) => Promise<SessionOpening>,
  framing?: Framing,
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
    ...(framing ?? AT_TOP),
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

describe("operator embedding, the minimum (W-49)", () => {
  it("opens the session in a frame whose every ancestor is listed", async () => {
    const session = counting();
    const result = await bootWith(environmentDocument(), session.open, {
      embedding: { framed: true, ancestorOrigins: [OPERATOR] },
    });
    expect(result.kind).toBe("configured");
    expect(session.opened()).toBe(1);
  });

  it.each<[string, Framing, string]>([
    [
      "an unlisted ancestor",
      {
        embedding: { framed: true, ancestorOrigins: ["https://evil.example"] },
      },
      "ancestor-not-allowed",
    ],
    [
      "a masked ancestor",
      { embedding: { framed: true, ancestorOrigins: ["null"] } },
      "ancestor-masked",
    ],
    [
      "a browser without `location.ancestorOrigins`",
      { embedding: { framed: true, ancestorOrigins: undefined } },
      "ancestors-unknown",
    ],
    ["an unknown framing", {}, "ancestors-unknown"],
  ])(
    "refuses to start with %s: no session, the reason code logged",
    async (_what, framing, code) => {
      const session = counting();
      const result = await bootWith(
        environmentDocument(),
        session.open,
        framing,
      );
      expect(result.kind).toBe("refused");
      expect(result.app.state().blocking).toBe("configuration-error");
      expect(document.body.textContent).toContain(m["state.configuration"]);
      expect(session.opened()).toBe(0);
      expect(discarded).toBe(1);
      expect(records).toEqual([
        { level: "warn", event: "embedding.refused", code },
      ]);
    },
  );
});

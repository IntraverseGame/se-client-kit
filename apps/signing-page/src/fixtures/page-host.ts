// A host for the page's component tests (jsdom): a recording opener, a fetch
// that serves the configuration, a manual clock, and an event target that
// stands for the page's `window` (its `message` events and EIP-6963's).

import type { OpenerWindow, PageHost } from "../signing-page.ts";
import { ANNOUNCE_EVENT } from "../wallet-discovery.ts";
import { type FakeClock, fakeClock } from "./fake-clock.ts";

export const OWN_ORIGIN = "https://signer.example-signer.test";
export const WRAPPER_ORIGIN = "https://wrapper.example.test";
export const OTHER_WRAPPER_ORIGIN = "https://wrapper-two.example.test";

export type Posted = { readonly message: unknown; readonly origin: string };

export type TestHost = PageHost & {
  readonly opener: OpenerWindow & { readonly posted: Posted[] };
  readonly clock: FakeClock;
  readonly events: EventTarget;
  readonly fetches: string[];
  /** How many times the opener was dropped, and what was posted before. */
  readonly drops: number[];
  /** What the page did to the opener and the window, in order. */
  readonly steps: Step[];
  /** Delivers a `message` event as the browser would. */
  readonly send: (data: unknown, from?: Partial<MessageFrom>) => void;
  /** Announces a wallet through EIP-6963. */
  readonly announce: (uuid: string, name: string, provider: unknown) => void;
};

type MessageFrom = { readonly origin: string; readonly source: unknown };

/** A post to the opener, the opener dropped, or the window closed. */
export type Step = "post" | "drop" | "close";

/**
 * A page that answered: its two `ready`s, the answer, the opener dropped, then
 * the window closed by the page (SP-9).
 */
export const ANSWERED: readonly Step[] = [
  "post",
  "post",
  "post",
  "drop",
  "close",
];

export type HostOptions = {
  /** `null`: no opener (SP-4). */
  readonly opener?: null;
  /** The configuration document; `NOT_JSON` for a body that is not JSON. */
  readonly config?: unknown;
  /** The configuration response's status (200 by default). */
  readonly status?: number;
};

/** A configuration body that is not JSON. */
export const NOT_JSON = Symbol("not JSON");

export const DEFAULT_CONFIG = {
  environment: "preview",
  wrapperOrigins: [WRAPPER_ORIGIN, OTHER_WRAPPER_ORIGIN],
  acceptPendingNotices: true,
};

/** A fresh root in the document. */
const mountRoot = (): HTMLElement => {
  document.body.replaceChildren();
  const root = document.createElement("div");
  document.body.append(root);
  return root;
};

export const testHost = (options: HostOptions = {}): TestHost => {
  const posted: Posted[] = [];
  const steps: Step[] = [];
  const opener = {
    posted,
    postMessage: (message: unknown, origin: string) => {
      posted.push({ message, origin });
      steps.push("post");
    },
  };
  const drops: number[] = [];
  const fetches: string[] = [];
  const events = new EventTarget();
  const config = "config" in options ? options.config : DEFAULT_CONFIG;
  const status = options.status ?? 200;
  // A response settled in microtasks only, so the manual clock drives it all.
  const fetchStub = ((input: RequestInfo | URL) => {
    fetches.push(String(input));
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () =>
        config === NOT_JSON
          ? Promise.reject(new SyntaxError("not JSON"))
          : Promise.resolve(config),
    });
  }) as unknown as typeof fetch;
  return {
    readOpener: () => (options.opener === null ? null : opener),
    dropOpener: () => {
      drops.push(posted.length);
      steps.push("drop");
    },
    closeWindow: () => {
      steps.push("close");
    },
    ownOrigin: OWN_ORIGIN,
    fetch: fetchStub,
    clock: fakeClock(),
    events,
    root: mountRoot(),
    opener,
    fetches,
    drops,
    steps,
    send: (data, from = {}) => {
      const event = Object.assign(new Event("message"), {
        data,
        origin: from.origin ?? WRAPPER_ORIGIN,
        source: "source" in from ? from.source : opener,
      });
      events.dispatchEvent(event);
    },
    announce: (uuid, name, provider) => {
      events.dispatchEvent(
        new CustomEvent(ANNOUNCE_EVENT, {
          detail: { info: { uuid, name }, provider },
        }),
      );
    },
  };
};

/** The page's heading text. */
export const headingOf = (host: TestHost): string =>
  host.root.querySelector("h1")?.textContent ?? "";

/** The wallet buttons, in order. */
export const walletButtons = (host: TestHost): HTMLButtonElement[] => [
  ...host.root.querySelectorAll<HTMLButtonElement>("button"),
];

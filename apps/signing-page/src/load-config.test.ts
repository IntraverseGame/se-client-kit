// T-47: the configuration read (SP-3): one request, to the page's own
// `/environment-config.json`, without credentials, never cached, refusing a
// redirect, given up after 8 s on the page's clock; anything but a valid
// document is no configuration.

import { describe, expect, it } from "vitest";

import { fakeClock } from "./fixtures/fake-clock.ts";
import {
  CONFIG_TIMEOUT_MS,
  type ConfigLoadOptions,
  loadSignerConfig,
} from "./load-config.ts";

const OWN = "https://signer.example-signer.test";
const DOCUMENT = {
  environment: "preview",
  wrapperOrigins: ["https://wrapper.example.test"],
};

type Call = { readonly url: string; readonly init: RequestInit | undefined };

const recordingFetch = (
  answer: (init: RequestInit | undefined) => Promise<Response>,
): { readonly fetch: typeof fetch; readonly calls: Call[] } => {
  const calls: Call[] = [];
  const fetchStub = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return answer(init);
  }) as typeof fetch;
  return { fetch: fetchStub, calls };
};

const options = (fetchStub: typeof fetch): ConfigLoadOptions => ({
  fetch: fetchStub,
  clock: fakeClock(),
  ownOrigin: OWN,
});

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("loadSignerConfig (SP-3)", () => {
  it("fetches its own origin's document once, with the spec's options", async () => {
    const { fetch: stub, calls } = recordingFetch(() =>
      Promise.resolve(json(DOCUMENT)),
    );
    const config = await loadSignerConfig(options(stub));
    expect(config?.wrapperOrigins).toEqual(DOCUMENT.wrapperOrigins);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${OWN}/environment-config.json`);
    expect(calls[0]?.init).toMatchObject({
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
    });
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("clears its timer once the document is read", async () => {
    const clock = fakeClock();
    const { fetch: stub } = recordingFetch(() =>
      Promise.resolve(json(DOCUMENT)),
    );
    await loadSignerConfig({ ...options(stub), clock });
    expect(clock.pending()).toEqual([]);
  });

  it.each([
    ["an error status", () => Promise.resolve(json(DOCUMENT, 404))],
    ["a body that is not JSON", () => Promise.resolve(new Response("{"))],
    [
      "a refused document",
      () => Promise.resolve(json({ ...DOCUMENT, extra: 1 })),
    ],
    ["a network failure", () => Promise.reject(new TypeError("offline"))],
  ])("gives no configuration for %s", async (_name, answer) => {
    const { fetch: stub } = recordingFetch(answer);
    expect(await loadSignerConfig(options(stub))).toBeUndefined();
  });

  it("aborts after 8 s on its clock and gives no configuration", async () => {
    const clock = fakeClock();
    const { fetch: stub } = recordingFetch(
      init =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const loading = loadSignerConfig({ ...options(stub), clock });
    expect(clock.pending()).toEqual([CONFIG_TIMEOUT_MS]);
    await clock.advance(CONFIG_TIMEOUT_MS - 1);
    expect(clock.pending()).toEqual([CONFIG_TIMEOUT_MS]);
    await clock.advance(1);
    expect(await loading).toBeUndefined();
    expect(CONFIG_TIMEOUT_MS).toBe(8000);
  });
});

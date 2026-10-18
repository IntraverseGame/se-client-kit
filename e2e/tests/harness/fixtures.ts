// The suite's `test`: Playwright's (its worker browser started through the
// start lock, worker-browser.ts), extended with the fixtures every e2e test
// stands on. Automatic for every test: the hermetic guard (no request leaves
// the fake origins), the static origins (the Wrapper's release bundle, the
// suite's test pages, and the reference game at D), and the seeded
// `crypto.getRandomValues`. On request: the fake Play API, the secret scan,
// and the network control. The accessibility audit is a plain function
// (accessibility.ts).

import { createFakePlayApi } from "./fake-play-api.ts";
import type { FakePlayApi } from "./fake-play-types.ts";
import { guardNetwork, type HermeticGuard } from "./hermetic.ts";
import { networkControl, type NetworkControl } from "./network.ts";
import { captureOrigins } from "./origin-capture.ts";
import { FAKE_NOW, WRAPPER_ORIGIN } from "./origins.ts";
import {
  keyDrawSecrets,
  stubRandomValues,
  type RandomDraws,
} from "./random-stub.ts";
import { startSecretScan, type SecretScan } from "./secret-scan.ts";
import { serveOrigins } from "./serve-origins.ts";
import { test as base, expect } from "./worker-browser.ts";

type Options = {
  /** Where the fake Play API is served; the configuration's `playApiBaseUrl`. */
  readonly playApiBaseUrl: string;
  /** Seeds the fake's secrets and the random source. */
  readonly seed: number;
};

type Fixtures = {
  readonly hermetic: HermeticGuard;
  readonly randomDraws: RandomDraws;
  readonly fakePlayApi: FakePlayApi;
  readonly secretScan: SecretScan;
  readonly network: NetworkControl;
};

export const test = base.extend<Options & Fixtures>({
  playApiBaseUrl: [`${WRAPPER_ORIGIN}/play/v1`, { option: true }],
  seed: [1, { option: true }],

  hermetic: [
    async ({ context, playApiBaseUrl }, use) => {
      const guard = await guardNetwork(context);
      await captureOrigins(context);
      await serveOrigins(context, playApiBaseUrl);
      await use(guard);
      expect(guard.refused(), "requests outside the fake origins").toEqual([]);
    },
    { auto: true },
  ],

  randomDraws: [
    async ({ context, hermetic, seed }, use) => {
      const draws = await stubRandomValues(context, seed);
      hermetic.addSecretSource(keyDrawSecrets(draws));
      await use(draws);
    },
    { auto: true },
  ],

  // Depends on `hermetic`, so the guard's catch-all route is registered first
  // and this route, registered after it, takes the Play API's requests.
  fakePlayApi: async (
    { context, hermetic, playApiBaseUrl, randomDraws, seed },
    use,
  ) => {
    const fake = createFakePlayApi({
      playApiBaseUrl,
      seed: String(seed),
      now: FAKE_NOW,
      secretSources: [keyDrawSecrets(randomDraws)],
    });
    hermetic.addSecretSource(fake.secrets);
    await fake.install(context);
    await use(fake);
    expect(
      fake.unexpected(),
      "calls the fake Play API had no answer for",
    ).toEqual([]);
  },

  secretScan: async ({ context, fakePlayApi, hermetic, randomDraws }, use) => {
    await use(
      startSecretScan(context, {
        sources: [fakePlayApi.secrets, keyDrawSecrets(randomDraws)],
        settle: randomDraws.settled,
        webSocketUrls: hermetic.webSocketUrls,
      }),
    );
  },

  network: async ({ context, fakePlayApi }, use) => {
    await use(networkControl(context, fakePlayApi));
  },
});

export { expect };

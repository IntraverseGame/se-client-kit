// A stub EIP-1193 provider for the page's tests: it records every call and
// answers each method from a script (a value, or an error to reject with). No
// key: the signature it gives is whatever the test scripts.

import type { Eip1193Provider } from "../wallet-port.ts";

export type ProviderCall = {
  readonly method: string;
  readonly params?: unknown;
};

/** An answer: resolve with `value`, reject with `error`, or never settle. */
export type ScriptedAnswer =
  | { readonly value: unknown }
  | { readonly error: unknown }
  | { readonly hang: true };

export type StubWallet = Eip1193Provider & {
  readonly calls: ProviderCall[];
};

/** A provider error with an EIP-1193 code. */
export const providerError = (code: number): Error =>
  Object.assign(new Error(`provider error ${String(code)}`), { code });

export const stubWallet = (
  script: Readonly<Record<string, ScriptedAnswer>>,
): StubWallet => {
  const calls: ProviderCall[] = [];
  return {
    calls,
    request: args => {
      calls.push(
        args.params === undefined
          ? { method: args.method }
          : { method: args.method, params: args.params },
      );
      const answer = script[args.method];
      if (answer === undefined || "hang" in answer) {
        return new Promise<unknown>(() => {
          // Never settles: the provider's own wait.
        });
      }
      return "error" in answer
        ? Promise.reject(answer.error as Error)
        : Promise.resolve(answer.value);
    },
  };
};

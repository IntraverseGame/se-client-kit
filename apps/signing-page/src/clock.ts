// The page's own clock (specs/signing-page.md, SP-3, SP-6, SP-8, SP-9): every
// wait (the configuration's 8 s, the request's 10 s, discovery's 1 s, and the
// revoke's 3 s) runs on it, so tests inject a fake one.

export type PageClock = {
  readonly setTimeout: (callback: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
};

/** Resolves after `ms` on `clock`. */
export const delay = (clock: PageClock, ms: number): Promise<void> =>
  new Promise(resolve => {
    clock.setTimeout(resolve, ms);
  });

// The page's own record of its Play API calls (T-36): a pass-through `fetch`
// that keeps each call's path and page time, and marks it once its answer was
// read, or records why the answer could not be read.

import { expect, type Page } from "@playwright/test";

export type PageCall = {
  readonly path: string;
  readonly at: number;
};

export const recordPageCalls = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const calls: PageCall[] = [];
    const read: number[] = [];
    const failed: string[] = [];
    const send = globalThis.fetch.bind(globalThis);
    const markRead = async (answer: Promise<Response>, index: number) => {
      await (await answer).clone().text();
      await new Promise(resolve => {
        const { port1, port2 } = new MessageChannel();
        port1.addEventListener("message", resolve, { once: true });
        port1.start();
        port2.postMessage(index);
      });
      read.push(index);
    };
    Reflect.set(globalThis, "pageCalls", calls);
    Reflect.set(globalThis, "pageAnswersRead", read);
    Reflect.set(globalThis, "pageAnswersFailed", failed);
    Reflect.set(
      globalThis,
      "fetch",
      (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = input instanceof Request ? input.url : input;
        const path = new URL(url, location.href).pathname;
        const index = calls.push({ path, at: Date.now() }) - 1;
        const answer = send(input, init);
        markRead(answer, index).catch((error: unknown) => {
          failed.push(`${path}: ${String(error)}`);
        });
        return answer;
      },
    );
  });

export const untilEveryAnswerRead = async (page: Page): Promise<void> => {
  const everyAnswerSettled = (): Promise<boolean> =>
    page.evaluate(() => {
      const calls: unknown = Reflect.get(globalThis, "pageCalls");
      const read: unknown = Reflect.get(globalThis, "pageAnswersRead");
      const failed: unknown = Reflect.get(globalThis, "pageAnswersFailed");
      return (
        Array.isArray(calls) &&
        Array.isArray(read) &&
        Array.isArray(failed) &&
        read.length + failed.length === calls.length
      );
    });
  await expect.poll(everyAnswerSettled).toBe(true);
  const failed: unknown = await page.evaluate(() =>
    Reflect.get(globalThis, "pageAnswersFailed"),
  );
  expect(failed).toEqual([]);
};

const isPageCall = (value: unknown): value is PageCall =>
  typeof value === "object" &&
  value !== null &&
  typeof Reflect.get(value, "path") === "string" &&
  typeof Reflect.get(value, "at") === "number";

export const pageCalls = async (page: Page): Promise<readonly PageCall[]> => {
  const calls: unknown = await page.evaluate(() =>
    Reflect.get(globalThis, "pageCalls"),
  );
  return Array.isArray(calls)
    ? calls.filter((call: unknown): call is PageCall => isPageCall(call))
    : [];
};

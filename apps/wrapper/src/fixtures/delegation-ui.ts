// Test-only: the Wrapper's UI wired to a scripted session that offers the
// wallet delegation (fake-delegation.ts), with a stubbed `window.open` that
// records its calls and answers a fake window handle (or `null`, a blocked
// window), and stubbed media queries (W-64's pointer and hover checks).

import type {
  DelegationOffer,
  DelegationWindow,
} from "@intraverse/se-client-shell";

import type { MessageDispatch } from "../message-dispatch.ts";
import { OFFERED, installDialog } from "./fake-delegation.ts";
import { type FakeSession, snapshotRead } from "./fake-session.ts";
import { type Wired, wired } from "./wired.ts";

/**
 * The signing page's origin the tests configure (a registrable domain of its
 * own).
 */
export const SIGNER = "https://signer.example-signing.org";

export type OpenCall = {
  readonly url: string;
  readonly target: string;
  readonly features: string;
};

export type FakeHandle = DelegationWindow & {
  readonly focused: () => number;
  readonly closes: () => number;
};

export const fakeHandle = (): FakeHandle => {
  let focused = 0;
  let closes = 0;
  return {
    closed: false,
    close: () => {
      closes += 1;
    },
    focus: () => {
      focused += 1;
    },
    postMessage: () => {},
    focused: () => focused,
    closes: () => closes,
  };
};

export type DelegationUi = Wired & {
  readonly opened: OpenCall[];
  readonly handle: FakeHandle;
  /** The media queries read, in order. */
  readonly queries: string[];
};

export type DelegationUiOptions = {
  /** What the shell offers; offered with the pending notice by default. */
  readonly offer?: DelegationOffer;
  /** Which media queries match; both of W-64's by default. */
  readonly matches?: (query: string) => boolean;
  /** `window.open`'s answer: the fake handle by default, or `null`. */
  readonly blocked?: boolean;
  /** Scripts the session further before it is wired. */
  readonly prepare?: (fake: FakeSession) => void;
  readonly messages?: MessageDispatch;
  /** `window.open` itself, to check when it runs. */
  readonly open?: (url: string, target: string, features: string) => void;
};

/** The UI at an `idle` round, the delegation offered. */
export const delegationUi = async (
  options: DelegationUiOptions = {},
): Promise<DelegationUi> => {
  installDialog();
  const opened: OpenCall[] = [];
  const queries: string[] = [];
  const handle = fakeHandle();
  const ui = await wired(
    fake => {
      fake.reads.push(snapshotRead("coinflip-idle"));
      fake.delegation.setOffer(options.offer ?? OFFERED);
      options.prepare?.(fake);
    },
    {
      ...(options.messages === undefined ? {} : { messages: options.messages }),
      delegation: {
        signingPageOrigin: SIGNER,
        open: (url, target, features) => {
          options.open?.(url, target, features);
          opened.push({ url, target, features });
          return options.blocked === true ? null : handle;
        },
        matches: query => {
          queries.push(query);
          return options.matches?.(query) ?? true;
        },
      },
    },
  );
  return { ...ui, opened, handle, queries };
};

/** The bar's menu button. */
export const menuButton = (host: HTMLElement): HTMLButtonElement => {
  const button = host.querySelector<HTMLButtonElement>(".se-menu-button");
  if (button === null) throw new Error("no menu button");
  return button;
};

/** The menu's panel, opened afresh as the player's click does. */
export const openMenu = (host: HTMLElement): HTMLElement => {
  const button = menuButton(host);
  if (button.getAttribute("aria-expanded") === "true") button.click();
  button.click();
  const panel = host.querySelector<HTMLElement>(".se-menu .se-popover");
  if (panel === null) throw new Error("no menu panel");
  return panel;
};

/** The consent dialog, open or not. */
export const consentDialog = (): HTMLDialogElement => {
  const dialog = document.querySelector<HTMLDialogElement>("dialog.se-dialog");
  if (dialog === null) throw new Error("no consent dialog");
  return dialog;
};

/** A button inside `root` by its exact text. */
export const buttonIn = (
  root: ParentNode,
  name: string,
): HTMLButtonElement | undefined =>
  [...root.querySelectorAll("button")].find(
    button => (button.textContent ?? "").trim() === name,
  );

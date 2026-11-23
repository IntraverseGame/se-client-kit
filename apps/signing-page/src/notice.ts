// The notice the page signs (specs/signing-page.md, SP-7): only one its own
// copy holds (`contracts`' runtime entry, read with `signing`'s notice reader),
// found by the request's `noticeId`, never text the Wrapper sends. An
// `approved` notice, or a `pending` one where the page's own
// `acceptPendingNotices` is `true`; any other id (not in the list, `retired`,
// or `pending` without the flag) is none. A list the reader refuses holds none
// (fail closed).

import { keyDelegationNotices } from "@intraverse/se-client-contracts";
import {
  type KeyDelegationNotice,
  readKeyDelegationNotices,
} from "@intraverse/se-client-signing";

/** The notice to sign, as the page shows it. */
export type PageNotice = {
  readonly id: string;
  /** The exact text the wallet signs. */
  readonly text: string;
  /** `pending` is marked "Pending legal review" (SP-10). */
  readonly status: "approved" | "pending";
};

/** The list, or none when the reader refuses it. */
const readList = (document: unknown): readonly KeyDelegationNotice[] => {
  try {
    return readKeyDelegationNotices(document);
  } catch {
    return [];
  }
};

/**
 * The notice `id` names, when the page may sign it, else `undefined`.
 * `document` is the vendored list; tests give another.
 */
export const findNotice = (
  id: string,
  acceptPendingNotices: boolean,
  document: unknown = keyDelegationNotices,
): PageNotice | undefined => {
  const notice = readList(document).find(entry => entry.id === id);
  if (notice === undefined) return undefined;
  if (notice.status === "approved") {
    return Object.freeze({ id, text: notice.text, status: "approved" });
  }
  return notice.status === "pending" && acceptPendingNotices
    ? Object.freeze({ id, text: notice.text, status: "pending" })
    : undefined;
};

import notices from "./key-delegation/v1/notices.json" with { type: "json" };

/**
 * The key-delegation notices `key-delegation/v1 notices`, as vendored from the
 * backend. It is data of unknown shape here on purpose: its readers check it
 * with `@intraverse/se-client-signing`'s `readKeyDelegationNotices`.
 */
export const keyDelegationNotices: unknown = notices;

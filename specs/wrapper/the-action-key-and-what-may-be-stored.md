# The action key and what may be stored

Part of the [Wrapper spec](../wrapper.md), section
[Contract](../wrapper.md#contract).

- **W-9.** The shell MUST generate the action key itself, on the first need
  (before the first `start`), from the browser's cryptographic random source
  (`crypto.getRandomValues`, 32 bytes, rejected and redrawn when zero or not
  below the curve order). Its address is the Ethereum address of its public key
  (Keccak-256 of the uncompressed public key without the prefix byte, the last
  20 bytes). Importing a key, and a key delegated by a wallet, are out of scope.
- **W-10.** The private key MUST exist only inside the shell's closure, as a
  value of the redacting key type (W-4). It MUST NOT be exported, returned,
  serialized, sent in a `postMessage`, attached to `window` or any global, or
  handed to the UI layer or the game. The signing function takes a digest and
  returns a signature; nothing returns the key.
- **W-11.** **Storage rule (decided, OQ-1,
  [Decided questions](../wrapper.md#decided-questions)).** In the first release
  the shell MUST keep the key and the token **in memory only**, and nothing in
  the Wrapper writes to persistent or tab-scoped browser storage. A reload, a
  closed tab, or the session's end destroys the key, and the shell zeroes the
  key bytes when the session ends (best effort: JavaScript cannot guarantee the
  memory is wiped). The Wrapper MUST NOT register a service worker and MUST NOT
  set cookies.
  - Why not storage that lives "for the session". `sessionStorage` survives a
    reload and is **copied into a duplicated tab**, so it would put one key in
    two live tabs. `localStorage` and IndexedDB survive the browser closing,
    outliving the session, and are readable by any script on the SE origin. A
    reload cannot be continued in any case: the token is memory-only and the
    launch code is single-use, so a reload needs a new launch and therefore a
    new session. The backend does not hand an open round to another session, so
    a key kept across a reload would not let the player move in that round. What
    a lost key costs is already the backend's rule: the round runs to its time
    limit and ends by its game's expiry rule, with no recovery path.
- **W-12.** What the Wrapper MAY keep after a page is gone: nothing. In
  particular no key, token, launch code, `CreateRoundAuth`, or signed action,
  and no identifier derived from them. The one exception is a download the
  **player starts** (the evidence export of W-27): the file goes to the player,
  and the page holds no copy of it afterwards. A persistent evidence store is
  deferred with the post-round evidence check
  ([OQ-1](../wrapper.md#decided-questions)).
- **W-13.** The shell MUST serialize the key's use behind its Web Lock (W-14)
  and MUST sign only on a player action or on the `PlayerCancel` that W-26
  requires. It MUST NOT sign in response to a message from the game that is not
  a validated action request (W-37, W-38).

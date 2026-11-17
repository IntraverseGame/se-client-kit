# The action key and what may be stored

Part of the [Wrapper spec](../wrapper.md), section
[Contract](../wrapper.md#contract).

- **W-9.** The shell MUST generate the action key itself, from the browser's
  cryptographic random source (`crypto.getRandomValues`, 32 bytes, rejected and
  redrawn when zero or not below the curve order). Its address is the Ethereum
  address of its public key (Keccak-256 of the uncompressed public key without
  the prefix byte, the last 20 bytes).
  - **When** (proposed,
    [RFC-006](../../rfcs/active/RFC-006-wallet-delegated-action-key.md)): at
    session open, once the shell holds the signer lock (W-14), or when the
    player chooses to delegate a wallet, and in any case before the first
    `start`, so the address exists before a delegation is signed. Not built yet
    (slice S5): until then the shell generates the key on the first need, before
    the first `start`.
  - Importing a key (a player-supplied key) is out of scope. A wallet MAY
    delegate to this key (proposed, RFC-006): the wallet signs a `KeyDelegation`
    that names the key's address. The key is still generated and held by the
    shell under W-9 to W-13, and the wallet never receives it.
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
  - **A wallet's delegation is memory-only too** (proposed, RFC-006; not built
    yet). The shell holds the delegation, the wallet's address, and the
    signature in memory for the session, and nothing stores them; the player
    signs again in each session. The Wrapper's origin never holds a wallet
    connection: the signing page, on its own origin, connects and then revokes
    (proposed,
    [ADR-012](../../decisions/ADR-012-the-signing-page-on-its-own-origin.md)).
- **W-12.** What the Wrapper MAY keep after a page is gone: nothing. In
  particular no key, token, launch code, `CreateRoundAuth`, or signed action, no
  wallet address or delegation (proposed, RFC-006), and no identifier derived
  from them. The one exception is a download the **player starts** (the evidence
  export of W-27): the file goes to the player, and the page holds no copy of it
  afterwards. A persistent evidence store is deferred with the post-round
  evidence check ([OQ-1](../wrapper.md#decided-questions)).
- **W-13.** The shell MUST serialize the key's use behind its Web Lock (W-14)
  and MUST sign only on a player action or on the `PlayerCancel` that W-26
  requires. It MUST NOT sign in response to a message from the game that is not
  a validated action request (W-37, W-38).

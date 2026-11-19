# ADR-012 — The signing page on its own origin

- Status: proposed (the decision taken by the human on 2026-11-17, in #220, and
  its open points, RFC-006 Q1, Q2, Q4, Q5, and Q-e, answered by the code owner
  the same day; this record awaits the human's acceptance, and the specs cite it
  as "proposed, ADR-012" until then)
- Date: 2026-11-17
- Relates to: [RFC-006](../rfcs/active/RFC-006-wallet-delegated-action-key.md)
  (the wallet-delegated action key),
  [ADR-001](./ADR-001-toolchain-and-signing.md) (no new runtime dependency),
  [ADR-005](./ADR-005-release-attestation-and-artifact-upload.md) and
  [ADR-009](./ADR-009-production-pages-deploy-trigger-and-source.md) (the
  release and its attestation), [ADR-007](./ADR-007-no-public-suffix-list.md)
  (the registrable-domain comparison),
  [ADR-008](./ADR-008-pages-deploy-with-wrangler.md) (the Pages deploy), W-10,
  W-11, W-37, W-49b, and W-49g of [the Wrapper spec](../specs/wrapper.md)

## Context

- The backend accepts a wallet's `KeyDelegation` on a start (RFC-006). Some code
  in the player's browser has to find the wallet, connect to it, and ask it to
  sign.
- A wallet connection is a grant to an origin, and it outlives the request that
  made it: until it is revoked, any script on that origin can read the account
  without a prompt and ask for signatures (each signature still prompts).
- The Wrapper's origin holds the player's action key and play token (W-10,
  W-11), and the Wrapper runs in the operator's iframe. #220's acceptance
  criteria say the Wrapper's origin never holds a wallet connection.
- Wallets inject their provider into frames (MetaMask and Rabby in the spike),
  the cross-origin Wrapper iframe included, and post their own messages inside
  it.
- The spike showed that a popup opened from the Wrapper's iframe can discover a
  wallet through EIP-6963, have it sign a chainless `KeyDelegation`, revoke the
  connection, and answer the Wrapper through `postMessage`, unless the operator
  page sends COOP `same-origin`.

## Decision

1. **A new app, `apps/signing-page`**, holds all of the kit's wallet code. Its
   source is public in this repository, like everything that holds or touches
   the player's key. The Wrapper has no wallet code.
2. **Its own origin, on another site.** It is served from an origin of its own:
   never from the Wrapper's origin (under a path or otherwise), the verify
   page's, or a game's. That origin is on a different registrable domain from
   the Wrapper's, by the same comparison as W-37 (the last two labels, ADR-007),
   for site isolation: in a browser with site isolation (desktop Chrome and
   Firefox), another site runs in another process, so the popup and its wallet
   code stay out of the process that holds the action key. The guarantee that
   holds everywhere is the same-origin policy: another origin's memory is not
   readable. The separate process is defense in depth; Safari is untested. The
   Wrapper's validator also refuses a `signingPageOrigin` equal to the verify
   page's origin (`verifyBaseUrl`'s origin) and, proposed in RFC-006, one equal
   to an entry of `operatorOrigins` or `gameOrigins`: those two lists of the
   same configuration are the only operator and game origins the validator
   knows.
3. **Configuration from one input.** The Wrapper's environment configuration
   names the page (`signingPageOrigin`). The signing page's own configuration
   document holds `environment`, the Wrapper origins it serves, and the same
   pending-notice flag as the Wrapper's, which its validator refuses in
   production, as the Wrapper's does. The Pages configuration job builds both
   documents from one input, as it builds the sites' policies, so they cannot
   disagree; the two sites deploy together and roll back together.
   Infrastructure adds a Pages project and a custom domain per environment.
   <!-- TODO(infra, #220): owner: infrastructure owner. The signing page's Pages project and custom domain for staging and for production. The origins are configuration values, set by the infrastructure owner and never written in this repository. -->
4. **Opened only as the Wrapper's popup**, unnamed, from the player's confirm
   click, and it talks to the Wrapper only through `se.delegation/1`, with
   source and origin checks on both sides (RFC-006 section 4). It takes its
   request only by `postMessage` from an allowed Wrapper origin, never from its
   URL.
5. **Dependencies.** Nothing but `signing` (for the exact typed data the shell
   verifies) and `contracts`' runtime entry (for its copy of the key-delegation
   notices, as the `verify` app takes it) at run time; no third-party runtime
   dependency; never `shell`. No package or app imports it.
6. **Release.** The same release, SRI, and attestation pipeline as the Wrapper
   and the verify page: it ships inside the Wrapper's release artifact, under a
   directory of its own, as the verify page does (V-16), so one digest and one
   attestation cover it. The Wrapper's site never serves that directory: the
   deploy lays out the signing page's site from it and leaves it out of the
   Wrapper's.
7. **Headers, and no API on its site.** A Content Security Policy with
   `connect-src 'self'` and `frame-ancestors 'none'`; no
   `Cross-Origin-Opener-Policy` header; `Referrer-Policy: no-referrer`. `'self'`
   is for one request: its own `environment-config.json`, written next to it by
   the deploy, so one attested build serves every environment, like the Wrapper
   and the verify page (V-17). The site routes no API: it gets no `_worker.js`,
   `_routes.json`, or `_redirects`, and the deploy refuses an artifact that
   holds one, as it does for the game's site.
8. **It keeps nothing.** No storage, cookie, or service worker; it logs nothing
   and emits no telemetry.

## Security reasoning

- **No silent grant for the key's origin.** The Wrapper never connects to a
  wallet, so no standing grant exists that code on the Wrapper's origin could
  use without a prompt. The signing page holds its connection only for the
  signature and then revokes it, best effort.
- **What this does not stop.** Wallets inject into the Wrapper's document too,
  so a compromised Wrapper could still ask the wallet for a connection of its
  own; the wallet's prompt would then show the Wrapper's origin. That residual
  risk is stated in RFC-006; this decision removes only the silent path.
- **A small surface.** The signing page's code asks the wallet for one thing: a
  `KeyDelegation` in one domain (RFC-006's wallet port), and it signs only
  notice text from its own copy, never text the Wrapper sends. The port binds
  that code, not a compromised page (below).
- **Another origin, and where the browser has it, another process.** The
  same-origin policy keeps the Wrapper's memory unreadable from the popup in
  every browser. In a browser with site isolation (desktop Chrome and Firefox),
  another site also runs in another process, so a flaw in the wallet code or an
  extension's page script there has no in-process path to the key. That is
  defense in depth; Safari is untested.
- **Contained requests.** `frame-ancestors 'none'`: no page can frame it and lay
  a decoy over the wallet's buttons. `connect-src 'self'`, with no API on its
  site, and `default-src 'none'` for every other load (proposed, RFC-006 section
  5): no fetch, image, or other subresource request from the page reaches
  another origin. `Referrer-Policy: no-referrer`: the page's requests and
  navigations send no `Referer` header, so its own URL is not passed on; it does
  not stop data the page puts in a URL. Navigations are not limited by CSP
  (below).
- **No COOP, on purpose, and its cost.** A COOP header on the signing page would
  cut its opener, as the operator's does (W-49g), so it sends none, and the
  Wrapper opens it without `noopener`. The cost: the page holds `window.opener`,
  the Wrapper's frame, so a compromised signing page can navigate that frame
  (`window.opener.location`). That ends the session, and it can put a page of
  its own inside the operator's frame. The decided order narrows that window
  (RFC-006): the page revokes its wallet connection (best effort, at most about
  3 s), then posts `result` or `failed`, then sets `window.opener = null`, and
  the Wrapper closes the popup when the answer arrives.
- **Navigation can carry data out.** Because CSP does not limit navigations, a
  compromised signing page can navigate itself, or the Wrapper's frame while it
  holds the opener, to another origin with what it holds in the URL: the action
  key's address, the session id, the expiry, the wallet's address, and the
  signature. None of them signs or spends (the private key, the play token, and
  the launch code never reach the page, RFC-006 section 4), but together they
  link the wallet to the session. The kit cannot block it; the page's code is
  public and attested.
- **Separate from the key.** A flaw in the signing page cannot read the action
  key or the play token: they are in another origin's memory, which the
  same-origin policy keeps unreadable, and, where the browser isolates sites, in
  another process. It can still call the injected provider directly, around the
  wallet port, and ask for any signature or transaction the wallet supports; the
  wallet prompts the player for each and shows the signing page's origin. It can
  also navigate, as above.

## Alternatives considered

- **The wallet in the Wrapper.** The key-holding origin would hold a standing
  wallet grant, and the Wrapper's bundle would carry wallet code. Rejected.
- **The signing page under a path of the Wrapper's origin** (`/sign/`). A grant
  is per origin, so this is the Wrapper holding it. Rejected.
- **The signing page on the Wrapper's site** (another origin, same registrable
  domain). A browser may keep a same-site popup in the Wrapper's process.
  Rejected by the code owner (2026-11-17; RFC-006 Q-e).
- **The signing page on the verify page's origin.** No new origin to run, but
  the public, read-only verifier would then hold a wallet grant, and its pages
  would share the grant. Rejected.
- **The signing page in a frame inside the Wrapper.** A third level of framing
  under the operator page, `frame-ancestors` that must admit the Wrapper, and
  each wallet's handling of framed pages, which the spike did not test.
  Rejected.
- **A full-page redirect.** Leaving the Wrapper's page ends the session: the key
  and the token are in memory only (W-11). Rejected.
- **A wallet library.** A new runtime dependency (ADR-001) for three calls the
  page makes itself. Rejected.
- **`connect-src 'none'`, the configuration in the page.** Fewer requests, but
  the page's bytes would differ per environment after the release is attested,
  or the build would. Rejected by the code owner (2026-11-17; RFC-006 Q1).
- **A release artifact of its own.** A second tar, digest, and attestation for
  the deploy to pull and check. Rejected for the verify page's arrangement
  (V-16; RFC-006 Q5).

## Consequences / tradeoffs

- One more origin, on another registrable domain, with a Pages project, a
  configuration document, and a set of headers to deploy and keep in step, per
  environment; the two sites deploy and roll back together.
- Operator pages must not send COOP `same-origin` (W-49g); `sandbox` without
  `allow-popups` blocks the window too, and the operator guidance already asks
  for no `sandbox`. Where the window cannot open or connect, the player plays
  on, undelegated.
- A compromised signing page can navigate the Wrapper's frame while it holds the
  opener (Security reasoning); the decided order (revoke, answer, drop the
  opener; the Wrapper closes the popup) shortens that window.
- The architecture docs name the new app from now, marked proposed:
  `AGENTS.md`'s architecture rules, the packages spec's dependency direction,
  and the client-kit spec's layout. The import-direction lint and its fixtures
  follow when it lands (S6b).
- The Wrapper's release build carries a third page, and its deploy must keep
  that page off the Wrapper's site.
- The dependency allow-list does not change.
- The page gets its own size measurement, as the verify page has.

## References

- [RFC-006](../rfcs/active/RFC-006-wallet-delegated-action-key.md): the design,
  the spike's evidence, the slices, the residual risk, and the answered
  questions.
- [specs/wrapper/operator-embedding.md](../specs/wrapper/operator-embedding.md)
  (W-49b, W-49g, the operator guidance).
- [specs/client-kit.md](../specs/client-kit.md) (the Pages sites' configuration,
  and the game's site, whose deploy refuses an API's files).
- EIP-712, EIP-1193, EIP-6963; the HTML standard's `window.open`,
  `Cross-Origin-Opener-Policy`, and `postMessage`.

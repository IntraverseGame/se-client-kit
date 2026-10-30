# @intraverse/se-client-wrapper

## 0.1.0

### Minor Changes

- [#164](https://github.com/IntraverseGame/se-client-kit/pull/164) [`4d5031a`](https://github.com/IntraverseGame/se-client-kit/commit/4d5031ad817cb372c4548d9a198a95c04ad45b3b) Thanks [@amirosein-union](https://github.com/amirosein-union)! - Frame a game at the path of its page on its origin, so several games can share
  one origin. `redeemLaunchCode` returns the redeem answer's optional `gamePath`
  when it has one, and throws a `ProtocolError` for one that breaks the Play API
  document's rule (1 to 255 characters, starting and ending with `/`, segments of
  unreserved characters, never `.` or `..`). A `PlaySession`'s accepted
  `mountGame` result adds `gamePath` (`/` when the answer has none), and the
  Wrapper frames `gameOrigin` + `gamePath` with its `parentOrigin`. Origin checks
  are unchanged: messages are still matched by the game origin only.

- [#109](https://github.com/IntraverseGame/se-client-kit/pull/109) [`5ee010a`](https://github.com/IntraverseGame/se-client-kit/commit/5ee010a3b7345bdbc5aa1e4b015f95c7de4ba8ac) Thanks [@mimshins](https://github.com/mimshins)! - When the page becomes visible again at `idle` or on a round's
  result, the Wrapper reads the Snapshot once (after a 1 s debounce), so a deposit
  made in another tab shows before the next start. It is not a poll: one read per
  return, none in a state that polls or shows a problem, and a failed read shows
  nothing. A Snapshot whose `version` is not higher than the shown one is still
  ignored (W-29).

- [#161](https://github.com/IntraverseGame/se-client-kit/pull/161) [`75a5e3d`](https://github.com/IntraverseGame/se-client-kit/commit/75a5e3d4a1601b363de505f0c227415869bfd33f) Thanks [@mimshins](https://github.com/mimshins)! - The Wrapper plays a book round ([#146](https://github.com/IntraverseGame/se-client-kit/issues/146), W-54 to W-56): `idle`, `starting`
  ("preparing the round", polled), and `won` or `lost` with the result, the
  payout as the Snapshot's `formatted` (never computed from the draw's
  multiplier), the round id, the verify link, and the next bet. Beside the bet
  selector it shows the mode's "Return to player: <p>%" from `config.rtp.decimal`
  by string operations only, and nothing when `rtp` is absent. The game frame is
  shown with a book round's result until the next start, and hidden otherwise, on
  a changed round, and when the game's `playback` copy failed closed, where "The
  game can't show this round." shows in its place. A changed round that is over shows its result with "This round failed
  verification." beside it, and the result heading takes focus when a poll brings
  the result of the book round the player just started. A changed session (W-53)
  shows "this round failed verification" with the detail "The game changed during
  this session. Reload to continue.", final until a reload, with the lobby control
  only (W-49f).

- [#64](https://github.com/IntraverseGame/se-client-kit/pull/64) [`41893b7`](https://github.com/IntraverseGame/se-client-kit/commit/41893b7b30142424ed46f2534d52a394c74da0fc) Thanks [@mimshins](https://github.com/mimshins)! - The Wrapper shows and reads the shell's required cancel (W-25, W-26, W-33,
  W-35). While the cancel is `settling`, the Snapshot is polled with the usual
  backoff and slow rate, also when the round shows `active` and through the
  round's failed verification, a typed error, or a rejected read; in
  `check-later` the fast poll stops and one background read runs every 30 s,
  with a "check again" control that reads once; the poll stops once the cancel is
  `ended`, `not-taken`, or `sent`. `check-later` shows "Still resolving — contact
  support" beside the failed verification, with the round id and the verify
  link; `ended` shows a neutral "Round ended" with the round id, the verify link,
  and a new round, and no result claim, after one more read for the current
  balance (a failed one keeps the round's balance, with no error); a `canceled` result of the shell's own
  cancel reads "This round failed verification and was canceled."

- [#48](https://github.com/IntraverseGame/se-client-kit/pull/48) [`f7661b4`](https://github.com/IntraverseGame/se-client-kit/commit/f7661b49856cb8b6822cf95fea6d2e7930fe66e4) Thanks [@mimshins](https://github.com/mimshins)! - The Wrapper boots from its environment configuration document and renders from
  validated Snapshots. At boot it reads the document (no credentials, no cache),
  validates it against the Wrapper's schema with the shell's chain rules, and
  refuses to start on an invalid one: `production` with `minRpcQuorum` below 2, a
  source with fewer endpoints than `minRpcQuorum`, an unknown field, or a
  malformed URL or origin list. It renders all seven statuses, the typed errors,
  and the degraded states; polls while `starting` or `resolving` with backoff and
  a "taking longer" notice; shows the connection-problem state without losing
  the round; and keeps the round id, a copy control, and the verify link after a
  round ends until the player starts another. Status changes go to a polite live
  region and errors to `role="alert"`; polls never move focus. The release build
  adds Subresource Integrity to the page's script and stylesheet, a `<meta>`
  Content Security Policy, a `headers.json` with the recommended headers, and an
  `integrity-manifest.json` of every file, then reads the written output back
  and fails unless it holds only regular files (no symbolic link), exactly the
  manifest's files with their hashes, and only allowed types: scripts and
  stylesheets the page loads with integrity, the manifest and headers JSON, and
  `index.html` as the one page (there is no public directory, and a dynamic
  `import()` chunk, another HTML spelling, or an SVG is refused). Session open, the round actions, the
  game iframe, and operator embedding come in later changes.

- [#92](https://github.com/IntraverseGame/se-client-kit/pull/92) [`51e45af`](https://github.com/IntraverseGame/se-client-kit/commit/51e45afb1ae429dfda07d161b9cb76ad7f5003a4) Thanks [@mimshins](https://github.com/mimshins)! - The Wrapper runs the operator launch contract (`se.operator/1`). A framed
  Wrapper opens no session, redeems nothing, signs nothing, mounts no game, and
  offers no control until the operator page's `hello` is accepted; with no valid
  `hello` within 10 s of the configuration's validation it shows the
  configuration-error state, finally. Only direct embedding is supported: a page
  framed through another page is refused, and where `location.ancestorOrigins`
  exists it must hold exactly one origin on `operatorOrigins`. Each refusal logs
  `embedding.refused` with its reason only (`nested`, `operator-not-allowed`, and
  `handshake-timeout` are new). Once accepted, the Wrapper tells the operator page
  its content's height (`resize`).
  
  The lobby and deposit are the player's own links to the Snapshot's
  `context.links`, offered only in the states that allow them: the lobby (on an
  `operatorOrigins` origin) navigates the operator's page, and the deposit opens a
  new page with no opener and no referrer. Neither is offered while a round is in
  play or while a start or cash-out call is in flight. A configuration whose
  `operatorOrigins` holds a game origin or the Wrapper's own origin, or whose
  `gameOrigins` holds the Wrapper's own origin, is refused.

- [#58](https://github.com/IntraverseGame/se-client-kit/pull/58) [`a6a8ff6`](https://github.com/IntraverseGame/se-client-kit/commit/a6a8ff656d7a6b1fce56dc493479cbc3cbdab1fc) Thanks [@mimshins](https://github.com/mimshins)! - The Wrapper opens a session. Its entry takes the launch code out of the URL
  fragment before any request (the configuration document included), and once
  the configuration is accepted it opens the session through the shell: no code,
  a refused or lost redeem, another tab holding the session, and a browser
  without Web Locks each show their own state and send nothing more. The bet
  selector starts a round with the Snapshot's own `Amount` fields; an `active`
  round is shown as being checked until the shell's W-26 checks pass, and as
  "this round failed verification", "could not verify the chain", or out of sync
  when they do not; the cash-out control is offered only when the shell offers
  it, and a second start or cash-out click while one is in flight does nothing
  (the shell refuses it too). Polling follows the shell's `isRoundOver`. The
  game iframe is mounted, sandboxed and titled, on the session's game origin D
  (the redeem answer's `gameOrigin`) with `?parentOrigin=<the Wrapper's origin>`
  only once the shell's bridge accepted D. No payout amount is shown on `won`
  yet. The tip check's JSON-RPC
  transport is added. Operator embedding, the W-49 minimum: a framed Wrapper
  opens no session unless `location.ancestorOrigins` exists and every entry is on
  `operatorOrigins` (a masked entry refuses); without that list (Firefox) it
  opens none while framed, until the operator handshake is built. A refusal
  shows the configuration-error state and logs `embedding.refused` with its
  reason code; the launch code is then discarded, as it is when the
  configuration is refused. The reduced-motion rule now also stops the progress
  icon's animation, which a class selector had kept running.

- [#94](https://github.com/IntraverseGame/se-client-kit/pull/94) [`151f845`](https://github.com/IntraverseGame/se-client-kit/commit/151f845f741aefa43a25a4f4d82920deef5478d3) Thanks [@mimshins](https://github.com/mimshins)! - The environment configuration document has a new required field,
  `verifyApiBaseUrl`: the verify API base, an absolute URL (`https:`, or `http:`
  on a loopback host, with no credentials, query, or fragment) whose path ends
  with `/verify/v1`, with no trailing slash. The Wrapper validates it and does
  not use it; the verify page reads the same document. It is never derived or
  defaulted: a document without it, or with another form, is refused with the
  configuration-error state. Update every environment's configuration document
  in the same release as this one.

- [#157](https://github.com/IntraverseGame/se-client-kit/pull/157) [`ace4a16`](https://github.com/IntraverseGame/se-client-kit/commit/ace4a160b98c428515d9121cc40a57fdcd5d2e55) Thanks [@mimshins](https://github.com/mimshins)! - The environment configuration's `verifyApiBaseUrl` must now be on the page's
  own origin: the verify API sends no CORS headers, so it is read same-origin
  only. The Wrapper refuses a document whose `verifyApiBaseUrl` has another
  scheme, host, or port than the Wrapper's own origin, with the
  configuration-error state (`invalid-verify-api-base`), and the verify page
  applies the same rule against its own origin. Set the field to the page's own
  origin plus `/verify/v1` in every environment's document before taking this
  release.

- [#179](https://github.com/IntraverseGame/se-client-kit/pull/179) [`9ab566f`](https://github.com/IntraverseGame/se-client-kit/commit/9ab566fc5fd6957eb9ebb7e470840ba076379556) Thanks [@mimshins](https://github.com/mimshins)! - The verify page in the release artifact reads book rounds ([#156](https://github.com/IntraverseGame/se-client-kit/issues/156), V-18 to
  V-21). A verify API body with `book` is a book round, and one with `book` and a
  signed creation authorization, ready evidence, or signed actions is refused as
  an API error. For a book round the page recomputes the round secret's
  commitment (check 5, replayed against the kernel's `round-secret-hash`
  vectors), block N by its quorum read with `entropy.chainId` held to the pinned
  chain (check 6), and the seed (check 7); checks 2 to 4 do not apply; the draw
  (check 8) and the payout are shown as not checked, since the verify API does
  not carry the mode's table (its rows and their weights), and a disagreement
  between the API's recorded and redrawn rows fails check 8. An ended `won` or `lost` book round reaches a new
  not-recomputable reason, "This round's draw was not recomputed", with its
  result and payout labelled as the verify API reports them; a `canceled` one is
  read under the `canceled` rules.

- [#180](https://github.com/IntraverseGame/se-client-kit/pull/180) [`0d964fa`](https://github.com/IntraverseGame/se-client-kit/commit/0d964fad42c890611989e759f8ecff20bc9fcc42) Thanks [@mimshins](https://github.com/mimshins)! - The verify page in the release artifact recomputes a Coin Flip round's payout
  (check 7). For a `won` or `lost` round, the payout follows from the recomputed
  outcome: 0 for a loss, and for a win Coin Flip's payout from the round's
  `game.terms` (house edge and multiplier cap) and its bet, in whole base units,
  as the SuperEngine fairness kernel's `coin-flip-payout` vectors pin it. A
  payout that differs from the round's fails check 7, and terms or a bet the
  kernel refuses make check 7 a mismatch naming the field. The summary of a
  matching `won` or `lost` round no longer labels its payout "not checked". The
  signed `payoutTermsHash` is still taken as signed and not tied to `game.terms`.

- [#100](https://github.com/IntraverseGame/se-client-kit/pull/100) [`bcbf5df`](https://github.com/IntraverseGame/se-client-kit/commit/bcbf5dfa1d7c6c545b1423ff9dea4e85ab83aa72) Thanks [@mimshins](https://github.com/mimshins)! - The release artifact now carries the verify page under `verify/`, with its own
  `<meta>` policy, SRI on its scripts and stylesheets, and its files in
  `integrity-manifest.json`; `verify/index.html` is the second allowed HTML file.
  `headers.json` now holds the headers by path pattern: `/*` for the Wrapper's
  (as before) and `/verify/*` for the verify page's, whose policy has one
  placeholder, `{{verifyConnectOrigins}}` (the origins of `verifyApiBaseUrl` and
  of the RPC endpoints). The deploy side reads the Wrapper's headers from `/*`
  and applies the `/verify/*` entry to that path. The size budget measures the
  verify page apart from the Wrapper's.

### Patch Changes

- [#87](https://github.com/IntraverseGame/se-client-kit/pull/87) [`24c1702`](https://github.com/IntraverseGame/se-client-kit/commit/24c170216ffaee26607bba99f75f6feaabfb5d2d) Thanks [@mimshins](https://github.com/mimshins)! - The Wrapper's build is now only ever one production build. It refuses any mode
  but `production` (Vite's build default; `--mode test` was already refused), a
  `NODE_ENV` other than unset or `production` (an empty value counts as unset),
  and a `VITE_USER_NODE_ENV` set to any non-empty value, beside its refusal of
  `VITEST`. It also reads no env files, so a `NODE_ENV=development` in an `.env`
  file cannot make a development build.

- [#83](https://github.com/IntraverseGame/se-client-kit/pull/83) [`fa524e6`](https://github.com/IntraverseGame/se-client-kit/commit/fa524e612bffb838f0c67fbbfee86241d0b3a5e1) Thanks [@mimshins](https://github.com/mimshins)! - After the required cancel, a round that had closed before the cancel arrived is
  never shown as canceled by the player. One that ends `canceled` with
  `closeReason: "expired"` reads "This round failed verification." followed by
  "The time limit ended this round.", not "…and was canceled". One that ends
  `won` or `lost` shows its result with "This round failed verification; it closed
  before the cancel arrived.", the round id, the verify link, and the next bet. A
  result with no cancel of the shell's is shown as before.

- [#74](https://github.com/IntraverseGame/se-client-kit/pull/74) [`1d9db05`](https://github.com/IntraverseGame/se-client-kit/commit/1d9db056553a8e0272de6dbf1bb0cf11d8989163) Thanks [@mimshins](https://github.com/mimshins)! - After a move in the game, the Wrapper's result or error heading now takes the
  focus even in engines that do not move the focus out of a focused iframe on
  `focus()` alone (Firefox with its frames in the parent's process, as in
  Playwright's Firefox build): when the game's iframe element has the focus, the
  Wrapper blurs it before focusing the heading (W-46). Nothing else in the focus
  behaviour changes.

- [#79](https://github.com/IntraverseGame/se-client-kit/pull/79) [`0152c38`](https://github.com/IntraverseGame/se-client-kit/commit/0152c383d6255fd76b5952ff57c652d7e8c6bab9) Thanks [@mimshins](https://github.com/mimshins)! - A move or cash-out whose one resend was lost too is no longer shown as a plain
  round in play (W-16). While the round is still `active` with the action neither
  applied nor refused, the Wrapper shows "Your move hasn't been confirmed" (or
  "Your cash-out hasn't been confirmed"), "If it never arrives, the round ends by
  its time limit.", the round id, and "Check again", with the game still waiting.
  "Check again" reads the round once, and the Wrapper reads it once every 30 s in
  the background; neither sends or signs anything. A typed error stops the
  background read until the player tries again or checks again; "Check again",
  like "Try again", now first clears the typed error shown. Any read that settles
  the round replaces the state. The heading is announced politely and takes the
  focus only after the player's own action (W-46).

- [#81](https://github.com/IntraverseGame/se-client-kit/pull/81) [`5478f4c`](https://github.com/IntraverseGame/se-client-kit/commit/5478f4c6db5aca9ee8680454e6e591bbbba3c62a) Thanks [@mimshins](https://github.com/mimshins)! - A round that ended (`won`, `lost`, `canceled`, or the shell's cancel `ended`)
  now shows its result with the next bet beside it: the bet selector and the
  start button, drawn from that Snapshot's own `bet`. The separate "New round"
  control is gone. The Play API's Snapshot read keeps answering the ended round
  until the next start, so a second round in one session no longer waits for an
  `idle` read that never comes. The round id and the verify link stay until the
  round the player started from them is shown; a refused start keeps them.

- [#85](https://github.com/IntraverseGame/se-client-kit/pull/85) [`5640638`](https://github.com/IntraverseGame/se-client-kit/commit/56406380eadf19b5067ec4889e6343010593a0ec) Thanks [@mimshins](https://github.com/mimshins)! - The Wrapper shows a finished round's payout: beside a `won` result, "Payout"
  with the Snapshot's `payout.formatted`, and beside a `lost` result only when
  `payout.value` is above 0 (compared as a `bigint`). It shows the same beside a
  round that closed before the shell's required cancel arrived. An absent
  `payout` shows nothing, with no error, and no amount is ever computed from
  `currentMultiplier` or anything else.

- [#82](https://github.com/IntraverseGame/se-client-kit/pull/82) [`53b74ae`](https://github.com/IntraverseGame/se-client-kit/commit/53b74aeb3c0ff694e4cfb1ddbde7b3c21de437e2) Thanks [@mimshins](https://github.com/mimshins)! - A later read can carry a lower Snapshot `version` than the one shown, which the
  Wrapper drops (W-29). Where no poll would read the round again, such as a
  move's or cash-out's result, or the start's answer from an ended round, the
  Wrapper now reads the Snapshot again: up to four reads at the polling backoff
  (500 ms, 1 s, 2 s, 2 s), then one every 30 s, until a read is taken. The
  re-reads only read, show no notice, move no focus, and stop on a typed error, a
  blocking state, or the session's end; they leave the shell's cancel reads
  alone. A lower `version` is still never shown.

- [#175](https://github.com/IntraverseGame/se-client-kit/pull/175) [`17908c2`](https://github.com/IntraverseGame/se-client-kit/commit/17908c2b9a29abd1a3433d1a92b5e12992af013b) Thanks [@amirosein-union](https://github.com/amirosein-union)! - Restyle the Wrapper's own UI: dark and light palettes, monospace uppercase
  headings and controls, pill buttons and bet options, a status panel, and a game
  frame that fills the column (taller at phone width). No behavior, protocol, or
  DOM change; the accessibility rules (contrast, 44 px targets, visible focus,
  reduced motion, rem sizing) hold.

- [#108](https://github.com/IntraverseGame/se-client-kit/pull/108) [`7ef26c1`](https://github.com/IntraverseGame/se-client-kit/commit/7ef26c1520e66110d08696a466787e6ae252950f) Thanks [@mimshins](https://github.com/mimshins)! - A start voided or refused before any money moved (`FUNDING_UNCONFIRMED`,
  `ENTROPY_UNAVAILABLE`, `PREPARATION_TIMEOUT`, `ROUND_VOIDED`) now shows "Back to
  start" instead of "Try again". The control reads the Snapshot again, as before,
  and the player starts a new round with the start control; it never repeats the
  start.
- Updated dependencies [[`4d5031a`](https://github.com/IntraverseGame/se-client-kit/commit/4d5031ad817cb372c4548d9a198a95c04ad45b3b), [`75a5e3d`](https://github.com/IntraverseGame/se-client-kit/commit/75a5e3d4a1601b363de505f0c227415869bfd33f), [`ee8ffe0`](https://github.com/IntraverseGame/se-client-kit/commit/ee8ffe07ed3c9ca7969ff442cc3f47f6029b0f9e), [`fa524e6`](https://github.com/IntraverseGame/se-client-kit/commit/fa524e612bffb838f0c67fbbfee86241d0b3a5e1), [`41893b7`](https://github.com/IntraverseGame/se-client-kit/commit/41893b7b30142424ed46f2534d52a394c74da0fc), [`d3393ee`](https://github.com/IntraverseGame/se-client-kit/commit/d3393ee2a104caac4e3623b530bdd3e6ac3f459b), [`bab05bd`](https://github.com/IntraverseGame/se-client-kit/commit/bab05bdf64d637f19a9439b4dc09bef5c12594bc), [`21aaefc`](https://github.com/IntraverseGame/se-client-kit/commit/21aaefc15aa6cc0013ce86fd188a05bb31163b17), [`eb12f69`](https://github.com/IntraverseGame/se-client-kit/commit/eb12f69b68237a06d1183b9f56f2cd88bb07a7e6), [`622de8f`](https://github.com/IntraverseGame/se-client-kit/commit/622de8fb0c3d4e92f72061a328ec5ee856ae1195), [`c60ca84`](https://github.com/IntraverseGame/se-client-kit/commit/c60ca844f4ab7d925af31936b26b2a75653bae53), [`51e45af`](https://github.com/IntraverseGame/se-client-kit/commit/51e45afb1ae429dfda07d161b9cb76ad7f5003a4), [`a6a8ff6`](https://github.com/IntraverseGame/se-client-kit/commit/a6a8ff656d7a6b1fce56dc493479cbc3cbdab1fc), [`237c797`](https://github.com/IntraverseGame/se-client-kit/commit/237c797172d5427e6a9d5728ff29c5b3a63157da), [`36b4c99`](https://github.com/IntraverseGame/se-client-kit/commit/36b4c9973478e33440f793cd6f9c756daafa633d), [`4b7e5de`](https://github.com/IntraverseGame/se-client-kit/commit/4b7e5deb565564d54022159696da8145ced2db45), [`0152c38`](https://github.com/IntraverseGame/se-client-kit/commit/0152c383d6255fd76b5952ff57c652d7e8c6bab9), [`75a5e3d`](https://github.com/IntraverseGame/se-client-kit/commit/75a5e3d4a1601b363de505f0c227415869bfd33f), [`0cbc2e4`](https://github.com/IntraverseGame/se-client-kit/commit/0cbc2e4c852c1bfba2cb6719c1aee953af30476a), [`13be3e4`](https://github.com/IntraverseGame/se-client-kit/commit/13be3e4e3a490682cce679636272f3dc5276d856)]:
  - @intraverse/se-client-shell@0.1.0

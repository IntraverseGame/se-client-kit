# ADR-011 — No `hello` where `location.ancestorOrigins` proves the parent

- Status: accepted (the rule decided by the human on 2026-11-10; this record
  accepted by the human on 2026-11-10)
- Date: 2026-11-10
- Supersedes, in part:
  [ADR-006](./ADR-006-the-operator-protocol-se-operator-1.md) decision 2's
  sentence "The handshake is required on every framed browser, not only where
  `location.ancestorOrigins` is missing", and the alternative it rejected, "The
  handshake only where `location.ancestorOrigins` is missing". ADR-006's
  protocol (its message set and fields), its record-then-check rule, its
  direct-embedding rule, and its lobby and deposit decision are unchanged.
- Relates to: [W-49a, W-49c, W-49d](../specs/wrapper/operator-embedding.md),
  [RFC-001](../rfcs/active/RFC-001-operator-launch-contract.md) Q2

## Context

ADR-006 requires every framed Wrapper to wait for the operator page's
`se.operator/1` `hello` before it opens a session, and shows the
configuration-error state ("The game cannot start", `handshake-timeout`) when
none arrives within 10 s. It chose one behaviour everywhere over fewer messages
on Chromium and WebKit, so that an operator that forgot the handshake would fail
on every browser, not only on one without `location.ancestorOrigins`.

Two things changed. First, every browser engine the kit's suite runs has
`location.ancestorOrigins`, Firefox's included (observed on its first e2e run,
2026-10-18; the spec records it), so the path ADR-006 feared, an operator that
works everywhere except Firefox, is narrowed to browsers older than those the
suite runs (an older or extended-support Firefox, for example). Second,
operators that come from other aggregator integrations embed the Wrapper in an
iframe on their own page and send no message to it, because those integrations
have no such message; every such launch fails with `handshake-timeout`.

Where `location.ancestorOrigins` holds exactly one entry, that entry is set by
the browser, cannot be written by the parent, and names the parent's origin.
ADR-006's handshake then already required the `hello`'s `event.origin` to equal
that entry: the `hello` proves nothing the list does not, except that the parent
runs a script. The clickjacking defence comes from which origin frames the
Wrapper, never from whether that origin runs a script.

## Decision

1. **A framed Wrapper opens its session without waiting for `hello`** when the
   page is not nested (`window.parent === window.top`) and
   `location.ancestorOrigins` exists and holds exactly one entry that is on
   `operatorOrigins` (exact match). The operator origin is then fixed to that
   entry for the life of the document.
2. **It still requires `hello`** (W-49c, 10 s, final) where
   `location.ancestorOrigins` is missing: there only the `hello`'s browser-set
   `event.origin` names the parent.
3. **Every refusal stays.** A masked (`"null"`) or empty list, more than one
   entry, an unlisted entry, and nesting are refused exactly as before, with the
   same reasons.
4. **A `hello` that does arrive is still checked and answered.** One recorded
   before the configuration was validated is checked at once, as before: from
   the proven origin it is accepted, from any other it is
   `operator-not-allowed`, final. A later valid `hello` from the fixed origin
   and `window.parent` is answered with `welcome`; one from any other origin or
   source is ignored and not answered.
5. **The Wrapper posts `welcome` once, unsolicited, when the gate opens on a
   proven origin**, and only to that origin. `welcome` keeps its meaning (the
   gate is open; stop repeating `hello`), so an operator that runs the handshake
   sees the same messages in the same order as before, and `resize` still
   follows `welcome` (W-49d). An operator that ignores messages loses nothing;
   one whose listener is installed late gets `welcome` again in answer to its
   first `hello`.
6. **The gate is unchanged.** Nothing is redeemed, started, signed, mounted, or
   offered before the framing decision; on the proven path the decision is the
   gate's opening, on the other path the accepted `hello` is.

## Security reasoning

- `frame-ancestors`, a response header set by the host, stays the primary
  control: it refuses an unlisted ancestor, at every level, before any of the
  Wrapper's code runs. The Wrapper's own checks remain defence in depth.
- On the proven path, the parent's origin is known to the Wrapper from the
  browser, before and without any message. The handshake's check of that parent
  (`event.origin` equal to `ancestorOrigins[0]` and on `operatorOrigins`) is the
  same check of the same fact: the list proves the parent's origin as well as
  the handshake did.
- **The one assumption this drops.** The handshake also required the framer to
  run script on a listed origin; the proven path does not. Any document served
  from a listed origin that can hold an `<iframe>` is now enough to open a
  session there: HTML injection on a page whose CSP blocks script, or user
  content that allows iframes. `frame-ancestors` already admits that case at the
  header level, and the framer still needs a valid single-use launch code, which
  only the launching operator receives, so the decision stands. It does mean
  `operatorOrigins` MUST list only origins whose every page the operator fully
  controls.
- The Wrapper still never posts to an origin it has not verified: `welcome` and
  `resize` go only to the entry the browser listed, as `targetOrigin`, so the
  browser drops them if the parent has navigated to another origin.
- Nesting and masking stay refused, so the cases where the list cannot prove a
  single listed parent are still not opened. Where the list is missing, the
  handshake is still required.
- No message gains a field or a meaning: `se.operator/1` is unchanged, so this
  is not `se.operator/2`.

## Alternatives considered

- **Keep ADR-006 as it is.** One behaviour everywhere, but every operator coming
  from an integration without the message fails to launch, for no security gain.
  Rejected.
- **Drop the handshake everywhere.** Where `location.ancestorOrigins` is
  missing, the Wrapper cannot learn its parent's origin any other way; it would
  open for any framer that passed `frame-ancestors`, leaving the JavaScript
  layer with nothing to check. Rejected.
- **Accept a nested page whose every ancestor is listed** (an aggregator that
  frames the Wrapper inside its own page). Out of scope: the parent, not only
  the top, would need its own proof, and ADR-006's direct-embedding rule is not
  revisited here.
- **Send no `welcome` on the proven path.** Fewer messages, but `resize` would
  then come without `welcome` (or never), and an operator running the handshake
  would see a different order on different browsers. Rejected.

## Consequences / tradeoffs

- An operator page needs no script to launch on a browser with
  `location.ancestorOrigins`; the handshake remains recommended, since it is
  required where the list is missing and is answered everywhere.
- An operator page that sends no `hello` still fails, with `handshake-timeout`,
  on a browser without `location.ancestorOrigins` (an older or extended-support
  Firefox, for example): the behaviour ADR-006 avoided, now on fewer browsers.
  The operator guidance says to send `hello` everywhere for that reason.
- Two paths to test (proven and handshake), which ADR-006 avoided: the proven
  path is covered by the e2e suite on every engine it runs, the handshake path
  by component tests (no engine the suite runs lacks the list).
- The launch is faster on the proven path (no `postMessage` round trip); the
  launch code's worst case before the redeem (about 25 s) is unchanged, and so
  is the duty to tell the backend before raising either timeout.
- An operator that sets `referrerpolicy="no-referrer"` (or `same-origin`) on the
  iframe is still refused where the engine masks the entry, `hello` or not.
- An aggregator that nests the Wrapper inside its own page is still refused
  (`nested`). Whether to support it is an open question for a later decision.
- Listing an origin on `operatorOrigins` now trusts every page on it, scripted
  or not: an origin that serves user content or has an HTML injection that can
  place an `<iframe>` must not be listed (the operator guidance says so). This
  is the residual risk the proven path adds.

## References

- [ADR-006](./ADR-006-the-operator-protocol-se-operator-1.md),
  [specs/wrapper/operator-embedding.md](../specs/wrapper/operator-embedding.md)
  (W-49a, W-49c, W-49d, the refusal table, the operator guidance, T-9a).
- The HTML standard: `location.ancestorOrigins` and its masking, `postMessage`.

# ADR-006 — The operator protocol `se.operator/1`: a separate protocol, operator first with record-then-check, and lobby and deposit as navigations

- Status: proposed
- Date: 2026-10-18
- Relates to: [RFC-001](../rfcs/active/RFC-001-operator-launch-contract.md) (the
  operator launch contract; its decisions of 2026-10-18),
  [specs/wrapper/operator-embedding.md](../specs/wrapper/operator-embedding.md)
  (W-49 to W-49f), and
  [the game iframe and the controller boundary](../specs/wrapper/the-game-iframe-and-the-controller-boundary.md)
  (`se.controller/1`, W-38)

## Context

The Wrapper runs in an iframe on the SE origin, embedded by an operator page on
origin A, and hosts the game in a second iframe on origin D. W-49 required an
origin- and source-checked handshake with the operator page, and the Boundary
section named `resize`, `lobby`, and `deposit` as messages to it, but neither
the handshake nor the messages were defined. Without a handshake, a framed
Wrapper cannot play on Firefox, which has no `location.ancestorOrigins`, and the
fail-closed minimum built in #58 refuses it there.

Operators will build against this protocol, and a change to it reaches every
integration: CONTRIBUTING's route treats a protocol as a hard-to-reverse choice.
RFC-001 holds the reasoning and the alternatives. The human decided its
handshake set and its lobby and deposit points on 2026-10-18 (RFC-001, Q1 to Q3,
Q5 to Q8, Q12 to Q15). What the backend has said: the launch handshake is this
repository's to design; the backend has no mechanism for `resize`, `lobby`, or
`deposit` and plans none; the lobby and the deposit reach the Wrapper only as
operator-supplied URLs in the Snapshot's `context.links`; and capabilities come
from the backend's Snapshot negotiation, never from the operator handshake
(RFC-001 Q9, agreed by the backend's TPO, 2026-10-18).

## Decision

1. **A separate protocol, `se.operator/1`,** between the operator page (the
   Wrapper's `window.parent`) and the Wrapper, apart from the game's
   `se.controller/1`. It has three messages: `hello` (operator to Wrapper),
   `welcome` and `resize` (Wrapper to operator). Every message carries
   `schema: "se.operator/1"` and a `type`, is a plain object with exactly its
   fields, and carries no secret, round id, session id, or amount. The Wrapper
   has one `message` listener that routes by `event.source` before it parses
   (the parent to this channel, the game frame to the controller bridge), so a
   message valid on one channel never parses on the other. Within `/1` the
   message set is frozen; a change is `se.operator/2`. The protocol carries no
   capability declaration.
2. **The operator page sends first, and the Wrapper records, then checks.** The
   operator page posts `hello` to the Wrapper's window with `targetOrigin` set
   to the SE origin, and repeats it until `welcome` arrives. The Wrapper records
   the first well-formed `hello` from `window.parent`, with its browser-set
   origin, before its configuration is validated, and checks it against
   `operatorOrigins` once it is; the first valid `hello` fixes the operator
   origin for the document's life, and a later one from that origin is answered
   with `welcome` again. Until the handshake is accepted on a framed page, the
   Wrapper redeems nothing, starts no round, signs nothing, and mounts no game;
   with no valid `hello` within 10 s of validation it shows the
   configuration-error state, finally. The handshake is required on every framed
   browser, not only where `location.ancestorOrigins` is missing, and only
   direct embedding (`window.parent === window.top`) is supported.
3. **Lobby and deposit are navigations, not messages.** They are the player's
   clicks on the Wrapper's own anchors, which follow the Snapshot's
   `context.links`: the lobby navigates the top-level window (`target="_top"`)
   and must be on `operatorOrigins`; the deposit opens a new browsing context
   (`noopener noreferrer`) and may be any `https:` URL. No URL is ever taken
   from a message, and no message, poll, timer, or game message causes a
   navigation.

The normative text, its states table, its log reasons, and the test plan (T-9a)
are in
[specs/wrapper/operator-embedding.md](../specs/wrapper/operator-embedding.md).

## Alternatives considered

- **The operator messages inside `se.controller/1`.** One protocol to maintain,
  but it ties two counterparties with different trust and release cadence, and
  lets a message valid on one channel parse on the other. Rejected.
- **The Wrapper sends first (`ready`).** On Firefox the Wrapper does not know
  the parent's origin, so it would post to every listed origin on every retry,
  to windows it has not verified. Rejected.
- **Drop an early `hello` and have the operator repeat with no cap.** Simpler
  state in the Wrapper, but a healthy launch then depends on the operator never
  capping its repeats, while the configuration read can take 15 s or be retried
  while unreachable. Rejected.
- **The handshake only where `location.ancestorOrigins` is missing.** Fewer
  messages on Chromium and WebKit, but two behaviours to test, and an operator
  that forgets the handshake works everywhere except Firefox. Rejected.
- **Lobby and deposit as `se.operator/1` messages,** or a message when the
  operator handles it and the link otherwise. The backend has no such mechanism,
  the links already carry the operator's intent, every operator would need
  script, and a message would be a second behaviour per control and per browser
  to test. Rejected; the schema RFC-001 sketched stays there.
- **A nonce echoed in the handshake.** The browser already authenticates
  `event.origin` and `event.source`. Not adopted.

## Consequences / tradeoffs

- Every framed integration needs a few lines of operator script (`hello` until
  `welcome`), even on browsers with `location.ancestorOrigins`. In exchange
  there is one behaviour everywhere, and the lobby and deposit need no script at
  all.
- Gating the redeem adds a `postMessage` round trip to the launch; a missing
  operator script costs up to the 10 s timeout before the error is shown. The
  launch code lives 60 s from the operator's Launch call (the backend's TPO,
  2026-10-18), which covers the kit's worst case of about 25 s.
- An aggregator that nests the Wrapper two levels deep is not supported until
  this decision is revisited.
- The lobby's top-level navigation depends on the browsers' user-activation rule
  for cross-origin frames and on the operator not sandboxing the iframe.
- An operator whose lobby is on another origin must list that origin, which also
  lets it frame the Wrapper.
- This tightens the minimum shipped in #58 (a page framed through several listed
  ancestors opens a session there today); the change lands with #42's
  implementation.
- **Exit criterion.** A change to the message set or a message's fields is
  `se.operator/2`, through a new ADR that supersedes this one.

## Open questions (for acceptance)

None for this decision. RFC-001's remaining open questions (Q4, a standalone
launch; Q10, a technical control against a listed operator that disguises the
Wrapper; Q16, the balance after a deposit in another tab) do not change the
protocol.

## References

- [RFC-001](../rfcs/active/RFC-001-operator-launch-contract.md) (the reasoning,
  the alternatives in full, and the decisions).
- [specs/wrapper.md](../specs/wrapper.md) (W-49's summary, the Boundary, the
  configuration rules, the test plan),
  [specs/wrapper/operator-embedding.md](../specs/wrapper/operator-embedding.md).
- The HTML standard: `postMessage`, `location.ancestorOrigins` and its masking,
  and the user-activation rule for top-level navigation from a frame.
- Backend-owned contracts, by name: the launch URL contract, the Snapshot schema
  `se.snapshot/1` (`context.links`), `sessions:redeem`.

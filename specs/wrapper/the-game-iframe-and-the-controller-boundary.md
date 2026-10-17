# The game iframe and the controller boundary

Part of the [Wrapper spec](../wrapper.md), section
[Contract](../wrapper.md#contract).

- **W-37.** The game runs in
  `<iframe sandbox="allow-scripts allow-same-origin">` served from game origin
  D, which MUST differ from the SE origin and MUST be on a different registrable
  domain, so a script in the game can never reach the Wrapper's storage or code.
  The Wrapper MUST refuse to mount a game whose origin equals its own, and MUST
  take D only from the environment configuration allow-list (never from a
  message, a URL parameter, or the Snapshot).
  - **At mount** the `shell`'s bridge refuses (and does not listen) when D or
    the Wrapper's origin is not a serialized origin as `event.origin` gives it
    (`https://host[:port]`, or `http:` on a loopback host only; lowercase, no
    path or credentials; a host of dot-separated labels of 1 to 63 letters,
    digits, or hyphens, none empty and none starting or ending with a hyphen,
    with no trailing dot; a port from 1 to 65535 with no leading zero, and never
    the scheme's default `:443` or `:80`, which a serialized origin omits;
    `null` and `*` are not origins), when D equals the Wrapper's origin, or when
    D is not on `gameOrigins` (exact match).
  - The "different registrable domain" rule is not checked in code yet: it needs
    a public suffix list, which is a new dependency and needs an ADR. Until then
    only an equal origin is refused (decided in human review, 2026-10-17).
    <!-- TODO(W-37, registrable domain): check D against the SE origin's registrable domain; needs a public suffix list and an ADR for the dependency. -->
  <!-- TODO(Play API, catalog): where D comes from for a launched game (the game's release target or the launch response). -->
- **W-38.** A message from the game is accepted only if `event.source` is the
  game frame's `contentWindow` **and** `event.origin` is D. The Wrapper posts to
  the game only with `targetOrigin = D`. Every accepted message MUST be parsed
  against a closed, versioned schema (`se.controller/1`, below) and ignored if
  it does not match. The game never receives the key, the token, a signature, a
  `CreateRoundAuth`, or a header: the Wrapper sends it the allow-listed copy of
  Snapshots that passed W-28 (below) and nothing else of the session.
- **`se.controller/1`, the first-release minimum.** Messages are JSON objects
  with `schema: "se.controller/1"` and a `type`. Controller variations come in
  later increments.

  | Direction       | `type`     | Fields                                           | Meaning                                                                                                                                      |
  | --------------- | ---------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
  | game to Wrapper | `hello`    | `presentations`, `statuses`                      | The game's capabilities. The Wrapper sends no variant the game did not declare.                                                              |
  | game to Wrapper | `action`   | `id`, `verb` (`pick`), `args` (`step`, `option`) | A pick request. It is not an action: the Wrapper validates it (W-23) and builds the signed action.                                           |
  | Wrapper to game | `snapshot` | `snapshot`                                       | A Snapshot that passed W-28, sent on every accepted change.                                                                                  |
  | Wrapper to game | `reject`   | `id`, `reason`                                   | An `action` request that was not accepted. `reason` is a closed list (`not_legal`, `not_active`, `busy`, `invalid`), never a server message. |

  The message set is closed: a `type` outside it is ignored. The operator page
  gets only `resize`, `lobby`, and `deposit` messages, under
  [W-49](../wrapper.md#operator-embedding).
  <!-- TODO(later increment): the full controller API and its schema, with the variations. -->

- **The message rules (decided in human review, 2026-10-17).**
  - A message is a plain object with exactly its fields. A string (a JSON text
    included), an array, a non-plain object, an accessor property, a symbol key,
    a missing field, or an extra field fails the schema and is ignored.
  - `hello`: `presentations` is a non-empty array, with no repeats, of the
    Snapshot schema's presentations (`steps`, `playback`); `statuses` is a
    non-empty array, with no repeats, of its seven `RoundStatus` values.
  - `action`: `id` is a string of 1 to 64 characters from `[A-Za-z0-9_-]`;
    `verb` is `pick`, the only verb; `args` is exactly `step` and `option`, each
    a non-negative safe integer, `step` a `Step.index` and `option` less than
    that step's `optionCount`.
  - The Wrapper sends nothing before the game's `hello`, `reject` included. The
    first `hello` that matches the schema counts, and later ones are ignored. A
    game must declare `steps` and all seven statuses (W-30); otherwise the
    Wrapper shows a generic "game not compatible" error, and sends and accepts
    nothing more. When the `hello` arrives, the latest Snapshot the Wrapper
    holds is sent.
  - The Wrapper sends only the `steps` presentation: a `playback` Snapshot is
    not forwarded in the first release. It does not send a Snapshot whose
    `version` is lower than the latest it was given (W-29).
- **The Snapshot allow-list (decided in human review, 2026-10-17).** The
  `snapshot` message carries a copy of the validated Snapshot built only from
  these fields, never by removing fields, so a field the schema adds reaches the
  game only once this list names it. The copy is not an `se.snapshot/1`
  document.

  | Field                                                                                                  | Why the game needs it                                      |
  | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
  | `version`                                                                                              | ordering                                                   |
  | `presentation` (always `steps`)                                                                        | the contract it renders                                    |
  | `status`, `closeReason`                                                                                | the state it shows (W-31, W-33)                            |
  | `roundId`                                                                                              | which round it renders                                     |
  | `step`, `currentMultiplier`                                                                            | the progress and the multiplier                            |
  | `context.language`, `context.device`, `context.theme.appearance`                                       | the language, layout, and light or dark                    |
  | `config.kind`, `config.steps[]` (`index`, `optionCount`, `multiplier`, `selectedIndex`, `losingIndex`) | the steps, the options to pick from, and what was revealed |

  Left out: all of `proofs` (so no `CreateRoundAuth`, signature, signer, or
  action key address), `context.sessionId`, `context.links`, `context.country`,
  `context.view` (personalization), `context.theme.colorPalette` and
  `tileStyles`, `bet`, `bankedAmount`, `schema`, and `model`. The game gets no
  amount: the Wrapper shows money (W-32, W-34).

- **A pick (W-23, decided in human review, 2026-10-17).** In this order:
  - a well-formed `action` envelope (its fields, the schema, and a valid `id`)
    whose `verb` or `args` are bad gets `reject: invalid`; any other schema
    failure is ignored;
  - while an earlier pick has not settled, every `action` gets `reject: busy`,
    one with the same `id` included; after it settles, a repeated `id` is a new
    request that the checks below decide;
  - the Wrapper's pre-check is an early filter, not the security gate. It reads
    only the latest Snapshot it sent the game, and the in-flight slot is freed
    when the use case settles, so a second pick for the same step can pass it
    before the Snapshot that answers the first arrives. A `playback` Snapshot,
    which is not forwarded, does not update the pre-check's state. The
    pre-check: a status other than `active` (or no Snapshot yet) gets
    `reject: not_active`; a `step` that is not the Snapshot's current `step`, a
    step the config does not have, or an `option` not below its `optionCount`
    gets `reject: not_legal`;
  - otherwise the pick goes to the shell's pick use case, the security gate. It
    MUST re-check W-23's legality against the shell's own latest validated
    Snapshot, MUST refuse a step it has already signed (W-15), checks what the
    bridge cannot (W-26 passed, no re-issue), builds, signs, and sends the move
    with one `idempotencyKey` for the intent (W-36), and answers. A pick while
    the round is not playable (W-26 not passed, a failed check, a re-issue) gets
    `reject: not_active`; a use case that fails also answers `not_active`.
    Nothing is sent to the game when a pick is accepted: the next Snapshot shows
    it.

- **W-39.** After a round ends (`won`, `lost`, or `canceled`) the Wrapper MUST
  show the **round id** (the Snapshot's `roundId`, UUIDv7 text) with a control
  to copy it, and a **link to the verify page** for that round. The verify base
  URL comes from the environment configuration, and the link opens in a new
  browsing context with `rel="noopener noreferrer"`.
  <!-- TODO(verify API): the verify page URL shape and whether it takes the round id in the path or a fragment. -->
- **W-40.** The round id and the link MUST stay visible until the player starts
  another round, and a new round MUST NOT replace them before the player acts.

# The game iframe and the controller boundary

Part of the [Wrapper spec](../wrapper.md), section
[Contract](../wrapper.md#contract).

- **W-37.** The game runs in
  `<iframe sandbox="allow-scripts allow-same-origin">` served from game origin
  D, which MUST differ from the SE origin and MUST be on a different registrable
  domain, so a script in the game can never reach the Wrapper's storage or code.
  The Wrapper MUST refuse to mount a game whose origin equals its own, MUST take
  D only from the `sessions:redeem` response's `gameOrigin`
  (`RedeemResponse.gameOrigin`: the launched game's catalog value, per game
  version, set by the server), and MUST mount it only when D is on the Wrapper's
  own allow-list, the environment configuration's `gameOrigins`. It never takes
  D from the operator's launch URL or launch response or anything else the
  operator supplies, a game message, a URL parameter, or the Snapshot.
  - **At mount** the `shell`'s bridge refuses (and does not listen) when D or
    the Wrapper's origin is not a serialized origin as `event.origin` gives it
    (`https://host[:port]`, or `http:` on a loopback host only; lowercase, no
    path or credentials; a host of dot-separated labels of 1 to 63 letters,
    digits, or hyphens, none empty and none starting or ending with a hyphen,
    with no trailing dot; a port from 1 to 65535 with no leading zero, and never
    the scheme's default `:443` or `:80`, which a serialized origin omits;
    `null` and `*` are not origins), when D equals the Wrapper's origin, or when
    D is not on `gameOrigins` (exact match). The allow-list and the Wrapper's
    origin are the session's, given when it opens from the accepted
    configuration and the page's own origin: the UI's mount passes only the
    frame, its message listener, and the incompatible-game notice, so it cannot
    point the check at another list.
  - **The "different registrable domain" rule, without a public suffix list**
    (decided in human review, 2026-10-18;
    [ADR-007](../../decisions/ADR-007-no-public-suffix-list.md), accepted). A
    host's comparison key is its last two dot-separated labels; an IP literal,
    or a host of fewer than two labels (`localhost`), is its own key. The bridge
    MUST refuse D at mount, in the same check as the rules above and with its
    own refusal code, when D's key equals the key of the Wrapper's origin. When
    the configuration's `environment` is `local` and both hosts are loopback
    hosts (`localhost`, `127.0.0.1`, `[::1]`), only an equal origin is refused,
    for local development; in `preview` and `production` loopback hosts follow
    the rule like any other. The bridge is given the environment with the
    allow-list and the Wrapper's origin, as the session's, when it opens from
    the accepted configuration (above). Two hosts on one registrable domain
    always share their last two labels, so the rule never accepts such a pair;
    it can refuse a legitimate pair on a shared multi-label public suffix
    (`a.co.uk` and `b.co.uk`), which fails closed. Built (#42): the refusal code
    is `same-site` (ADR-007's open question 1, confirmed on its acceptance). An
    IP literal is recognised in its canonical serialized form (four decimal
    parts of 0 to 255 with no leading zero, or `[::1]`) before any label split.
  - **Where D comes from** was decided in human review, 2026-10-17: the
    `sessions:redeem` response's `gameOrigin`, a serialized origin with no path
    (`https:`, or a loopback `http:` origin in a local environment), which the
    backend takes from the game catalog. The operator cannot set D, and the
    launch URL never carries it. `play-client` refuses a redeem answer whose
    `gameOrigin` is missing, empty, or longer than 267 characters (the
    document's bounds), so no session opens without D; the shell takes D from
    that answer only, and the bridge checks it at mount (above). No
    `se.operator/1` message carries D, a game id, or any input to the game's
    mount ([Operator embedding](./operator-embedding.md)).
  - **The frame's URL** is the game's page on D, at the `sessions:redeem`
    response's `gamePath` (D's root, `/`, when the answer has none), with the
    Wrapper's own serialized origin as the query parameter `parentOrigin`, built
    with the `URL` API (decided in human review, 2026-10-17; the path decided
    2026-10-28, in the backend's Play API as `RedeemResponse.gamePath`): for
    example `https://games.example/?parentOrigin=https%3A%2F%2Fplay.example`, or
    `https://games.example/coin-flip/?parentOrigin=...` for a game whose page is
    at `/coin-flip/`. It is not a secret. The game checks it against
    `location.ancestorOrigins[0]` where that exists and talks to nobody when
    they disagree. The Wrapper sets the frame's `src` only after the bridge
    accepted D, so a refused D is never loaded, and the frame is kept for the
    session's life and hidden unless the round is shown ready (`active` after
    W-26 passed, or `resolving`, W-31). A book round's frame is also shown at
    `won` and `lost`, for the playback ([W-55](./book-playback.md)).
  - **The game's page path** (`RedeemResponse.gamePath`, optional) lets several
    games share one origin under different paths. `play-client` refuses a redeem
    answer whose `gamePath` breaks the document's rule (1 to 255 characters,
    starting and ending with `/`, segments of 1 to 63 letters, digits, `-`, `.`,
    `_`, or `~`, never `.` or `..`), so the URL it builds stays on D; an answer
    without one is D's root. The path is not a trust boundary: every check of
    this section and W-38 is on D, the allow-list stays a list of origins, and
    games that share D share its storage with each other, never with the
    Wrapper. Like D, it comes from the redeem answer only.
  - **Where games share an origin** (decided 2026-10-28). One game origin shared
    by many games, each under its own path, is accepted for staging; in
    production one origin per game is recommended and the path stays optional.
    The reference game stays at `/` on the kit's own game site
    ([The game's site](../client-kit.md#the-games-site)). Other staging games
    are deployed from their own source to their own site and origin, never to
    the kit's, so the two deploys never overwrite each other; that origin is
    added to the staging Wrapper's `gameOrigins`.
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
  | Wrapper to game | `snapshot` | `snapshot`                                       | A Snapshot that passed W-28, sent on every accepted change: its `steps` copy, or (#146) its `playback` copy.                                 |
  | Wrapper to game | `reject`   | `id`, `reason`                                   | An `action` request that was not accepted. `reason` is a closed list (`not_legal`, `not_active`, `busy`, `invalid`), never a server message. |

  The message set is closed: a `type` outside it is ignored. The operator page
  has its own protocol, `se.operator/1`, with `hello`, `welcome`, and `resize`
  only; the lobby and the deposit are navigations, not messages
  ([Operator embedding](./operator-embedding.md), W-49b to W-49e). No operator
  message reaches the game, and no game message reaches the operator page.
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
  - **Decided by the human, 2026-10-28 (RFC-003, issue #146); it replaces the
    two items above when the Wrapper ships book playback.** A game must declare
    all seven statuses and at least one presentation; `steps` is no longer
    required. The Wrapper sends a Snapshot only in a presentation the game
    declared: when the Snapshot it is about to send (the latest it holds when
    the `hello` arrives, or any later one) has a presentation the game did not
    declare, it shows the generic "game not compatible" error, and sends and
    accepts nothing more. A `steps` Snapshot is sent as its `steps` copy and a
    `playback` Snapshot as its `playback` copy (below). The `version` rule
    (W-29) is unchanged. A game that declares `steps` only and plays a `steps`
    game is unaffected.
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

  **The `playback` copy (decided by the human, 2026-10-28; RFC-003, issue
  #146).** Built the same way, field by field, from a validated `playback`
  Snapshot (a book round, W-50 to W-56):

  | Field                                                                                                 | Why the game needs it                       |
  | ----------------------------------------------------------------------------------------------------- | ------------------------------------------- |
  | `version`                                                                                             | ordering                                    |
  | `presentation` (always `playback`)                                                                    | the contract it renders                     |
  | `status`, `closeReason`                                                                               | the state it shows                          |
  | `roundId`                                                                                             | which round it renders                      |
  | `context.language`, `context.device`, `context.theme.appearance`                                      | the language, layout, and light or dark     |
  | `config.kind` (always `book`), `config.model`                                                         | the contract, and the mode it plays         |
  | `config.draw` (`index`, `payoutMultiplier`, `events[]` with `index`, `type`, and `data` when present) | the drawn book to play back (`won`, `lost`) |

  `config.draw` is copied only when the Snapshot has it (on `won` and `lost`;
  the schema forbids it before and on `canceled`). An event's `data` is a member
  the schema leaves open (its shape is the math package's; the contract says it
  is absent or an object). It is copied as a deep copy of its JSON value
  (objects, arrays, strings, numbers, `true`, `false`, `null`), read from own
  data properties only, so the game gets data and no object of the Wrapper's:
  - every object of the copy is created with a null prototype and each member is
    set with `Object.defineProperty` (a data property, enumerable, writable,
    configurable), so an own `__proto__` key in the data is copied as a member
    and can never change a prototype; a JSON array is copied as an array of
    copied items (clarified with the implementation, #146: "object" is a JSON
    object);
  - the copy is bounded: nesting at most **32** levels deep (an event's `data`
    is level 1; an object or array inside a level-n container is level n + 1,
    and a string, number, `true`, `false`, or `null` adds no level; clarified
    with the implementation, #146), and at most **10 000** values (objects,
    arrays, and primitives, counted over every event's `data` of the Snapshot);
  - a `data` that breaks a bound, or that cannot be read as JSON data (an
    accessor, a symbol key, a cycle, a value of another type), fails the copy,
    and the copy fails closed: that Snapshot is **not forwarded** to the game
    (the game keeps the last copy it was sent), and the Wrapper shows its own
    view of the Snapshot as usual (the result, the payout, the round id, and the
    verify link, W-54) with the frame hidden and the notice "The game can't show
    this round." in its place. A later Snapshot whose copy succeeds is forwarded
    as usual (its `version` is higher), and the notice goes. The copy is built
    when the bridge is given the Snapshot, before the game's `hello` too: a copy
    that failed is never held, so the `hello` is answered with the last copy
    that was built (clarified with the implementation, #146). Left out:
    everything the `steps` copy leaves out, and `config.packageHash`,
    `config.rtp` (the Wrapper shows it, W-56), and `payout`. `payoutMultiplier`
    is the drawn row's display multiplier, never money; the game shows no
    amount. Decided by the human, 2026-10-28: this allow-list, with
    `packageHash` and `rtp` left out.

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
    which the first release does not forward, does not update the pre-check's
    state; once it is forwarded (#146) it does, like any other. The pre-check,
    in this order:
    1. a pick while the latest Snapshot sent is `playback` gets
       `reject: not_legal`, whatever its status, since a book round takes no
       pick; this runs **before** the status check, so a book round never
       answers `not_active` (decided by the human, 2026-10-28; RFC-003). The
       shell's pick use case refuses it too, and nothing is signed (W-51);
    2. a status other than `active` (or no Snapshot yet) gets
       `reject: not_active`;
    3. a `step` that is not the Snapshot's current `step`, a step the config
       does not have, or an `option` not below its `optionCount` gets
       `reject: not_legal`;
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
  to copy it, and a **link to the verify page** for that round. The verify page
  is the kit's ([verify-page.md](../verify-page.md); decided by the backend's
  TPO, 2026-10-18), and the link is `<verifyBaseUrl>/rounds/{roundId}`: the
  environment configuration's `verifyBaseUrl` with one trailing `/` removed if
  present, then `/rounds/`, then the round id in its canonical text form (it is
  validated, so it needs no escaping). The link opens in a new browsing context
  with `rel="noopener noreferrer"`; `verifyUrlFor` in `apps/wrapper` builds it.
  The page's content, and what it shows from the verify API's response, are the
  verify page spec's.
- **W-40.** The round id and the link MUST stay visible until the player starts
  another round, and a new round MUST NOT replace them before the player acts.
  The next bet is offered beside them (W-31). They go once the Snapshot of the
  round the player started from them is shown; a start that is refused (a typed
  error) or not answered yet keeps them, and so does a Snapshot of another round
  that the player did not start from them.

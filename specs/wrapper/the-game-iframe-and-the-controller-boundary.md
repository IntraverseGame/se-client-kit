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
  <!-- TODO(Play API, catalog): where D comes from for a launched game (the game's release target or the launch response). -->
- **W-38.** A message from the game is accepted only if `event.source` is the
  game frame's `contentWindow` **and** `event.origin` is D. The Wrapper posts to
  the game only with `targetOrigin = D`. Every accepted message MUST be parsed
  against a closed, versioned schema (`se.controller/1`, below) and ignored if
  it does not match. The game never receives the key, the token, a signature, a
  receipt, or a header: the Wrapper sends it Snapshots (validated, W-28) and
  nothing else of the session.
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

- **W-39.** After a round ends (`won`, `lost`, or `canceled`) the Wrapper MUST
  show the **round id** (the Snapshot's `roundId`, UUIDv7 text) with a control
  to copy it, and a **link to the verify page** for that round. The verify base
  URL comes from the environment configuration, and the link opens in a new
  browsing context with `rel="noopener noreferrer"`.
  <!-- TODO(verify API): the verify page URL shape and whether it takes the round id in the path or a fragment. -->
- **W-40.** The round id and the link MUST stay visible until the player starts
  another round, and a new round MUST NOT replace them before the player acts.

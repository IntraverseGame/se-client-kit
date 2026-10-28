---
description: The game page path (`gamePath`) waits for the Play API document sync
owner: client kit maintainers
status: blocked
related: feat/game-page-path
created: 2026-10-28
---

# The game page path waits for the contract sync

## Context

The Wrapper frames `<gameOrigin><gamePath>?parentOrigin=...` (W-37). The code
in `play-client` (`src/redeem-fields.ts`), `shell` (`GameMount.gamePath`), and
the Wrapper (`gameUrlOf`) reads `RedeemResponse.gamePath`, which the vendored
Play API document does not have yet, so `pnpm typecheck` fails on that field
until the sync below.

## Findings / hypotheses

- The backend adds `RedeemResponse.gamePath` (optional, always sent) in
  `/play/v1`; it is not merged yet, so there is no source commit to vendor.
- Since this kit's pinned commit the backend's Play API document has other
  changes too (the book `BookRtp` schema and book status descriptions); the
  sync brings them in, and they need their own review.
- The document's `gamePath` pattern refuses `.` and `..` segments without a
  lookahead. After the sync, check that it accepts and refuses the same forms
  as `isGamePath` in `src/redeem-fields.ts`.

## Open questions

None: the decisions were taken on 2026-10-28 (W-37, "Where games share an
origin").

## To promote on resolution

1. Once the backend change is merged, re-vendor `play.yaml` from that merged
   commit with `tools/sync-contracts.ts`, then run
   `pnpm exec tsx tools/generate-contracts.ts --write`.
2. Add `@intraverse/se-client-contracts` to `.changeset/game-page-path.md` with
   the document sync, run `pnpm check`, and delete this file.

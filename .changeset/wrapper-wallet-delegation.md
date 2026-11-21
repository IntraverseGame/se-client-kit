---
"@intraverse/se-client-wrapper": minor
---

The opt-in wallet delegation (RFC-006). The environment configuration gains
two optional fields: `signingPageOrigin`, the signing page's origin (refused
with `invalid-signing-page-origin` when it is not one serialized `https:`
origin, `http:` on a loopback host in `local` only; `signing-page-same-site`
on the Wrapper's registrable domain; `overlapping-origins` when it is the
verify page's origin, an operator's, or a game's), and `acceptPendingNotices`
(refused with `invalid-accept-pending-notices` when not a boolean, and
`pending-notices-in-production` when `true` in production); the verify page
judges them by the same rules and does not use them. Without a signing
page nothing is offered, so production, whose only notice is still pending,
plays as before. With one, the bar's menu offers "Link a wallet" on a desktop
browser when no round is open and the game is not a book game; it opens a
consent dialog (a modal dialog, staging texts) that shows the exact English
notice the wallet signs, and its confirm opens the signing window under the
player's click. The menu then reads "Signing window open", and "Wallet linked
for this session" with the wallet shortened once the link is registered
("Wallet linked." is announced). A failed attempt is told in the alert line,
and play goes on without a wallet. A start refused with
`KEY_DELEGATION_INVALID`, `KEY_DELEGATION_EXPIRED`, or
`KEY_DELEGATION_NOTICE_UNKNOWN` shows "Your wallet link was refused, and the
round did not start." with the code's own label, "Sign again", and "Continue
without", and the start control stays disabled until the player chooses; any
other refusal of a delegated start offers "Continue without a wallet". A round
whose evidence does not carry the wallet link the start sent fails
verification with the label "The wallet link in this round's evidence does not
match."; the action key is drawn when the session opens rather than at the
first start, and a key that cannot be drawn shows the session-ended state; and
the page's one `message` listener routes the signing window's messages to the
shell only. Nothing about the delegation is stored or logged.

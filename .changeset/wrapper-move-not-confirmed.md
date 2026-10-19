---
"@intraverse/se-client-wrapper": patch
---

A move or cash-out whose one resend was lost too is no longer shown as a plain
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

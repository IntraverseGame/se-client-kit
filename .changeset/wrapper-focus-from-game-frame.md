---
"@intraverse/se-client-wrapper": patch
---

After a move in the game, the Wrapper's result or error heading now takes the
focus even in engines that do not move the focus out of a focused iframe on
`focus()` alone (Firefox with its frames in the parent's process, as in
Playwright's Firefox build): when the game's iframe element has the focus, the
Wrapper blurs it before focusing the heading (W-46). Nothing else in the focus
behaviour changes.

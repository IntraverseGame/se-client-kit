---
"@intraverse/se-client-wrapper": patch
---

The control bar floats on glass from 40rem over a game that draws under it
(`inset`), not only from 66rem: a frame narrower than 1056 CSS pixels, common
at a 125 % display scale, kept a docked, solid bar. Over any other game the bar
still docks under 66rem, since its apron is sized for the one-line bar.

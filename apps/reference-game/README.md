# `@intraverse/se-client-reference-game`

A minimal Coin Flip game for the SuperEngine Wrapper.

**This is not a production game.** It exists for the kit's own tests, as the
game the end-to-end suite loads, and as a sample for game developers who build a
game for the Wrapper. It has no artwork, no sound, and no translations, and it
plays Coin Flip only.

**Status:** pre-release. It is an application, not an npm package, and is never
published.

## What it shows

How a game talks to the Wrapper through the controller protocol
`se.controller/1`, and nothing more:

- It runs in a sandboxed iframe at its own origin and holds no key, no token,
  and no amount. The Wrapper shows the bet and the money; the game shows the
  round and asks for a pick.
- It takes only the type definitions of the protocol, with `import type` from
  `@intraverse/se-client-shell/controller`. That subpath has types only, and the
  game's build refuses any package at run time, so no code of the kit or of any
  other package reaches its bundle.
- Its page carries a Content Security Policy that allows only its own scripts
  and stylesheets.
- On load it sends `hello`, declaring the `steps` presentation and all seven
  round statuses.
- It accepts a message only from its parent window, at its parent's origin, and
  only when the message matches the protocol exactly: a `snapshot` with the
  game's copy of the round, or a `reject` for its own pick. Anything else is
  ignored. It posts only to its parent's origin.
- It learns its parent's origin from the `parentOrigin` query parameter of its
  URL, checked against `location.ancestorOrigins` where the browser has it. When
  it cannot tell, it talks to nobody.
- It renders every status (`idle`, `starting`, `active`, `resolving`, `won`,
  `lost`, `canceled`, and an expired round), asks for a pick with an `action`
  message, holds the calls until a newer Snapshot or a `reject` answers, and
  explains each reject reason (`not_legal`, `not_active`, `busy`, `invalid`).
- It never goes back to an older Snapshot (a lower `version`).

## Accessibility

The page follows the Wrapper's rules where they apply: the round's state is
announced politely, a refused pick as an alert, every control has a text label,
focus moves to the round's heading when the calls go away while one of them is
focused or once the player's own pick is answered, and never otherwise, targets
are at least 44 by 44 CSS pixels, focus is always visible, there is no motion
when the system asks for reduced motion, and sizes are in rem so the page scales
with the text. It follows the Snapshot's light or dark appearance. Its text is
English only.

## More

- [The reference game](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/client-kit/the-reference-game.md)
  in the kit specification
- [The game iframe and the controller boundary](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper/the-game-iframe-and-the-controller-boundary.md)
  in the Wrapper specification

Contributing: see
[CONTRIBUTING.md](https://github.com/IntraverseGame/se-client-kit/blob/main/CONTRIBUTING.md).

# `@intraverse/se-client-wrapper`

The SuperEngine Wrapper: the page that runs a game in the player's browser. It
shows the round, asks the player to choose, and hosts the game in a sandboxed
iframe.

**Status:** pre-release: an empty entry. It is an application, not an npm
package; a release bundle will be built from it and served from the SuperEngine
origin. The name is the intended one.

## What it guarantees

- The player's action key never leaves the Wrapper's shell
  (`@intraverse/se-client-shell`). The page and the game never receive a secret.
- The game runs in a sandboxed iframe and talks to the Wrapper only through the
  controller protocol `se.controller/1`.
- The Wrapper renders only a Snapshot that has been validated.
- The Wrapper writes nothing to `localStorage`, cookies, or any persistent
  storage unless its specification says so; the key is never persisted.
- Amounts are shown from strings or `bigint`, never `number`.

Specified, not implemented yet: the entry is empty today; these are the
guarantees the Wrapper is specified to give.

## Test data never ships

The test vectors of the kit are not part of the Wrapper bundle. The release
build refuses a bundle in which they could appear, and it also inspects the
final files: a vector's content found in any emitted file, however it got there
(including a file copied verbatim from a `public/` directory), fails the build.
That inspection finds content that is present in one of its recognisable forms
(the file itself, its JSON, escaped or base64 text, also with the trailing
newline trimmed or with CRLF line breaks). It does not find data transformed so
that none of those forms remains (a re-encoded or compressed copy, a
line-wrapped base64, hex, or UTF-16 copy); a re-indented JSON copy is found only
through the minified form, and only when the vector parses as JSON. Vectors
below a small minimum size are outside it.

## For game developers and integrators

A game receives its state from the Wrapper and sends its choices back through
the controller protocol. See the Wrapper specification for the protocol and for
how an operator embeds the Wrapper.

## More

- [The Wrapper specification](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper.md)
- [The game iframe and the controller boundary](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper/the-game-iframe-and-the-controller-boundary.md)
- [The action key and what may be stored](https://github.com/IntraverseGame/se-client-kit/blob/main/specs/wrapper/the-action-key-and-what-may-be-stored.md)

Contributing: see
[CONTRIBUTING.md](https://github.com/IntraverseGame/se-client-kit/blob/main/CONTRIBUTING.md).

# ADR-007 — W-37's registrable-domain rule without a public suffix list

- Status: accepted
- Date: 2026-10-20 (proposed 2026-10-18; accepted by the human)
- Relates to:
  [W-37](../specs/wrapper/the-game-iframe-and-the-controller-boundary.md) (the
  game origin D), [ADR-001](./ADR-001-toolchain-and-signing.md) (the runtime
  dependency allow-list),
  [RFC-001](../rfcs/active/RFC-001-operator-launch-contract.md) (its decision
  list, item I5, decided by human review on 2026-10-18)

## Context

W-37 requires the game origin D to differ from the SE origin **and** to be on a
different registrable domain, so a script in the game can never reach the
Wrapper's storage or code, and the two never share a site. Today only an equal
origin is refused (decided in human review, 2026-10-17). The marker
`TODO(W-37, registrable domain)` recorded that the full rule needs a public
suffix list, which would be a new runtime dependency (or a large data file) and
so needs an ADR.

A registrable domain is a host's public suffix plus one more label
(`example.co.uk` for `game.example.co.uk`). Computing it exactly needs the
public suffix list: about 10,000 rules, maintained upstream, changing every few
weeks, with a private section (`github.io`, cloud hosting suffixes) that matters
for exactly the hosts a game might use.

## Decision

**No public suffix list.** The rule is checked with a conservative approximation
that never accepts a pair on the same registrable domain:

1. **The comparison key of a host** is its last two dot-separated labels
   (`example.com` for `game.example.com`; `co.uk` for `game.example.co.uk`). A
   host that is an IP literal, or has fewer than two labels (`localhost`), is
   its own key. Hosts are compared as the serialized origin gives them
   (lowercase, no trailing dot), which W-37's origin grammar already requires.
   They are compared in their ASCII (`xn--`) serialization: W-37's grammar
   already refuses a Unicode host. An IP literal is recognised in its canonical
   serialized form, before any label split, so its dot-separated parts are never
   treated as labels.
2. **Refuse D when its key equals the SE origin's key.** The shell's controller
   bridge refuses at mount, before it listens and before the frame's `src` is
   set, in the same check as the equal-origin and allow-list rules (W-37), with
   its own refusal code.
3. **Loopback exemption, in a local environment only** (decided by the human,
   2026-10-18). When the configuration's `environment` is `local` and both hosts
   are loopback hosts (`localhost`, `127.0.0.1`, `[::1]`), only an equal origin
   is refused: local development serves the Wrapper and the game from one
   machine on different ports. In `preview` and `production` the rule applies to
   loopback hosts like any other, so two origins on one loopback host are
   refused there (wording decided 2026-10-19; the rule is W-37's). The bridge is
   given the environment, with the allow-list and the Wrapper's origin, when the
   session opens from the accepted configuration; the UI cannot pass it.

**Why it is sound.** A registrable domain has at least two labels, so two hosts
on the same registrable domain always share their last two labels: the
approximation can refuse a pair the exact rule would allow, but never allow a
pair the exact rule would refuse. Two IP literals share a site only when they
are equal, which rule 1 covers.

**What it costs.** It refuses legitimate pairs whose hosts share a multi-label
public suffix: `a.co.uk` and `b.co.uk`, or two `github.io` subdomains. Each is
fail-closed: the game is not mounted, as for a D off the allow-list (W-37). The
deploy side then serves D from a domain that does not share the SE origin's last
two labels, which a production setup does anyway.

## Alternatives considered

- **A public suffix list as a runtime dependency** (an npm package such as a PSL
  parser). Exact, but a new runtime dependency on the package that holds the
  player's key (ADR-001's allow-list), tens of kilobytes in the bundle, and a
  list that goes stale between releases. Rejected.
- **A vendored, hash-pinned copy of the list.** No npm dependency, but a large
  data file kept current by hand, and the same staleness. Rejected.
- **Deploy-time check only** (a tool that checks the environment configuration
  document against the list). Moves the dependency to development tooling, but
  the Wrapper would trust a document it fetches at run time. Rejected as the
  only control; it may be added on top later.
- **Leave the rule unchecked** (equal origin only). Keeps a requirement the code
  does not enforce. Rejected.

## Consequences / tradeoffs

- No dependency is added; ADR-001's allow-list is unchanged.
- `gameOrigins` must not hold an origin that shares its last two labels with the
  SE origin; such an entry is refused at mount. The e2e harness already uses
  `https://wrapper.e2e.test` and `https://game.e2e-games.test`, whose keys
  differ.
- The spec states the rule in W-37, and `TODO(W-37, registrable domain)` is
  closed. The shell's bridge implements it (#42, merged in #92).
- **Exit criterion.** If a deployment needs D on a shared multi-label suffix, a
  new ADR revisits this one (for example, the vendored list).

## Resolved questions

1. **The refusal code's name** for the bridge. Resolved: built with #42 as
   `same-site` (`ControllerMountRefusal`), and confirmed by the human with this
   decision's acceptance.

Decided by the human on 2026-10-18, and folded into the decision above: the
loopback exemption applies only when the configuration's `environment` is
`local`, and the bridge is given the environment (decision 3).

## References

- [specs/wrapper/the-game-iframe-and-the-controller-boundary.md](../specs/wrapper/the-game-iframe-and-the-controller-boundary.md)
  (W-37),
  [specs/client-kit/the-shell-package.md](../specs/client-kit/the-shell-package.md)
  (the controller bridge).
- [ADR-001](./ADR-001-toolchain-and-signing.md) (the dependency allow-list).
- The HTML standard's definitions of a host's registrable domain and of a site;
  the public suffix list (publicsuffix.org).

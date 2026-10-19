---
"@intraverse/se-client-wrapper": patch
---

The Wrapper's build is now only ever one production build. It refuses any mode
but `production` (Vite's build default; `--mode test` was already refused), a
`NODE_ENV` other than unset or `production` (an empty value counts as unset),
and a `VITE_USER_NODE_ENV` set to any non-empty value, beside its refusal of
`VITEST`. It also reads no env files, so a `NODE_ENV=development` in an `.env`
file cannot make a development build.

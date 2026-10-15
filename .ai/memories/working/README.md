# working memories

Committed, temporary context: investigations, hypotheses, open questions,
in-flight work. Not contracts and not procedures.

Create one from [`../../templates/working-memory.md`](../../templates/working-memory.md).
Frontmatter: `description`, `owner`, `status` (`active` | `blocked` |
`ready-to-promote`), `related` (branch, issue, or PR), `created`.

## Lifecycle

- **Before merging a linked PR, resolve the memory:** promote the durable parts,
  then delete the file.
- Promote system contracts → `specs/`; accepted decisions → `decisions/`;
  proposals → `rfcs/`; procedures → `runbook/`; durable agent context →
  `.ai/memories/`; reusable workflows → `.ai/skills/`.
- A working memory idle for **30 days** is reviewed by its owner and promoted,
  updated, or deleted.

This repository is public: a working memory is world-readable, so it holds no
secrets, personal data, or private-repository internals, and its `owner` is a
role or team, not a person's name.

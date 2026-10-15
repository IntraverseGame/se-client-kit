---
name: prd-to-spec
description: Use when given a rough PRD, feature request, or raw requirement. Turns it into a spec update, an RFC when the change is significant or contested, and an ADR for hard-to-reverse decisions.
---

# prd-to-spec

The agent-executable form of
[CONTRIBUTING.md#development-flow](../../../CONTRIBUTING.md#development-flow).

## Prerequisites

- The PRD (external; never commit it wholesale, and never copy private
  material into this public repository).
- Existing contracts in `specs/` and decisions in `decisions/`.

## Workflow

1. **Frame:** problem, users, scope, non-goals, acceptance criteria, security
   and privacy impact (does it touch a key, a token, or personal data?), and
   what, if anything, it emits. List open questions, then ask the human with
   [ask-the-human](../ask-the-human/SKILL.md) rather than invent. What the
   human defers and does not block the spec becomes a `<!-- TODO -->`; a
   blocking gap keeps the spec from being handed off as ready.
2. **Locate:** which specs, packages, and contracts are affected? Which ADRs
   constrain the solution? Which of them are backend-owned contracts (name them,
   do not copy private text)?
3. **Route:**
   - small, well-understood → update the spec(s) directly;
   - significant, cross-cutting, or contested → write
     `rfcs/active/RFC-NNN-<slug>.md` from [the RFC template](../../templates/rfc.md)
     (status `draft`);
   - hard-to-reverse choice (dependency, protocol, package structure, supply
     chain) → `decisions/ADR-NNN-<slug>.md` from
     [the ADR template](../../templates/adr.md).
4. **Write the spec** (template: [spec.md](../../templates/spec.md)): contract,
   invariants, errors, security, and what it emits.
5. **Check readiness** (definition of ready): spec agreed or RFC accepted;
   acceptance criteria written.
6. **Hand off** to the implementer with the list of spec sections and tests
   expected.
7. When an RFC is accepted: fold it into specs (+ ADR), set status `archived`,
   move it to `rfcs/archived/`.

## Constraints

- Specs describe current/accepted behavior, not wishes; proposals stay in RFCs.
- Mark unknowns with `<!-- TODO -->`; never fabricate versions, scopes,
  hostnames, or contract details.
- Never overwrite an ADR; supersede it with a new one.
- Public repository: no secrets, internal hostnames, dashboard links, personal
  data, or unpublished backend internals.

## Expected output

Spec diff (and RFC/ADR when routed there) plus a short hand-off note.

## References

- [ADR-002](../../../decisions/ADR-002-spec-driven-development.md),
  [documenter agent](../../agents/documenter.md)

# Active RFCs

Proposals that are not accepted yet. Use an RFC when a change is significant,
cross-cutting, or contested; a small, well-understood change goes straight into
a spec.

- File name `RFC-NNN-<slug>.md`, from
  [the RFC template](../../.ai/templates/rfc.md); status `draft` or `active`.
- An RFC never overrides accepted specs or ADRs.
- When accepted, its durable content moves into `specs/` (and an ADR if the
  choice is hard to reverse), its status becomes `archived`, and the file moves
  to [`../archived/`](../archived/).
- When only part of an RFC is accepted, it stays here with status `active` and a
  dated Decisions section that names, for each accepted point, the spec or ADR
  that now holds it; the open points stay open. It is archived once the last one
  is decided.
- Public: no secrets, internal hostnames, or personal data.

| RFC                                                   | Status | Proposal                                                                                                                                                                         |
| ----------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [RFC-001](./RFC-001-operator-launch-contract.md)      | active | the operator launch handshake (`se.operator/1`), `resize`, lobby, deposit; mostly accepted 2026-10-18 (in the specs, ADR-006, ADR-007); Q4 and Q10 open (Q16 decided 2026-10-20) |
| [RFC-002](./RFC-002-preview-mode-of-the-e2e-suite.md) | draft  | a `preview` Playwright project for the backend-owned preview-stack run (T-10 to T-12, W-29): variables, launch hook, allow-listed network, Cash or Crash page, pin recipe        |

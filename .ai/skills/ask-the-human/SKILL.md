---
name: ask-the-human
description: Use when you hit an open question, a decision that is not yours to make, a gap or ambiguity in a spec, or a draft that needs a human's confirmation. Asks through the host's structured-question tool with concrete options and a recommendation, instead of guessing or burying the question in prose.
---

# ask-the-human

The one way every role agent raises a question to the human. It is
tool-agnostic: it names the capability (a structured question with selectable
options) and says what to do on a host that lacks it.

## Prerequisites

- You know what is blocking you and have already looked it up, in the
  precedence order of [AGENTS.md](../../../AGENTS.md#precedence-and-secrets):
  code/config, specs, decisions, runbook, memories. Ask only what they cannot
  answer.

## Workflow

1. **Decide whether to ask.**
   - **Ask** when: the spec is missing or ambiguous; code and spec disagree and
     the intended behavior is unclear; two valid designs have different
     consequences; scope or acceptance criteria are unclear; an RFC or ADR
     still has an undecided item; a draft needs the human's confirmation; an
     action is hard to reverse or outward-facing; something belongs to someone
     else (changes in another worktree).
   - **Do not ask** when: the repository answers it; a convention gives an
     obvious default (take it and say so in your report); it is a permission
     ping ("Should I proceed?", "Is the plan ready?"); or an approval gate
     already covers it.
2. **Collect first.** Gather every open question before asking, and ask them
   in one batch. A question that depends on another's answer waits for it. If
   there are more than the tool takes per call, ask the ones that block you
   first and the rest in a second call; do not drop any.
3. **Shape each question.**
   - One decision, self-contained, ending in `?`, with a short header naming
     the topic.
   - A few options, mutually exclusive unless the question is multi-select (say
     so in the question). Each option has a short label and a description of
     what happens if it is chosen.
   - **Recommend only with a basis.** When a spec, ADR, accepted convention, or
     the surrounding code favors one option, put it first, mark it as
     recommended, and cite the source in its description
     (`specs/<file>.md#<section>`, `ADR-NNN`). With no basis, recommend
     nothing; never invent one.
   - When options differ in something concrete (a snippet, a config, a layout),
     show it in the option's preview if the tool supports previews.
4. **Ask through the tool.**
   - **Claude Code:** `AskUserQuestion`. Its limits: up to 4 related questions
     per call, 2 to 4 options each, a header of 12 characters or fewer, a
     label of 1 to 5 words, `(Recommended)` at the end of the recommended
     label, and a free-text "Other" it adds itself, so do not add one.
   - **Another host:** the equivalent structured-question tool in your tool
     list, within its limits.
   - **No such tool, or you are a subagent that cannot prompt the human:** do
     not continue past the blocker on a guess. In chat, print the same
     questions as a numbered list with lettered options and the recommended one
     marked, and stop. A subagent returns them under **Open questions** in its
     final report so the parent agent asks.
5. **Act on the answer.**
   - Apply it and say what you decided in your report: question, answer, where
     it is recorded.
   - Record durable answers where they belong: behavior in the spec (or an
     RFC/ADR, through the [documenter](../../agents/documenter.md)); in-flight
     context in a [working memory](../../memories/working/README.md).
   - An item the human defers, or leaves unanswered and that does not block
     you, becomes a `<!-- TODO -->` marker; never fill it in yourself. An item that
     does block you stops you (step 4).
   - A free-text answer is the human's decision, not a hint: follow it. If it
     contradicts an accepted spec or ADR, say so in your report and update the
     spec in the same change (ADR-002; the implementer hands that to the
     [documenter](../../agents/documenter.md)); if an accepted ADR is affected,
     open an RFC or supersede it with a new ADR rather than leaving it stale.
     Explicit developer instructions outrank specs and decisions (AGENTS.md
     precedence).
   - "You decide" means take the recommended option, or your best-grounded one,
     and state it.

## Constraints

- **An answer is not an approval gate.** It never stands in for the human's
  review of a diff or the reviewer agent's approval (ADR-003). Do not use it to
  ask whether to stage, commit, or push: that waits for the human's own
  request.
- **Outward-facing text is shown in full first.** For anything posted outside
  the repository (pull request comments, ADR-003), print the exact text in
  chat, then ask with options such as _Post as written_, _Change it_, _Do not
  post_. This repository is public, so what is posted is world-readable. A confirmation covers that text only; a changed draft is asked again.
- Approval in one context does not extend to another: ask again for each
  hard-to-reverse or outward-facing action.
- One round of questions (it may take more than one call), then proceed. Do
  not ask the same question twice or keep a conversation going through the
  tool.
- Questions and options carry no secrets, credentials, or internal hostnames.
  Treat chat output as possibly pasted into a public issue.

## Example

Illustrative; the placeholders stand for real paths and ADR numbers.

```text
header:   Retry policy
question: Which retry policy should the <job> use when <dependency> times out?
options:
  1. Fixed delay (Recommended)
       specs/<file>.md#<section> already uses it for <similar job>.
  2. Exponential backoff
       Better for a long outage; adds a config variable and a spec change.
  3. No retry
       Fails the round at once; the <caller> must handle it.
```

## Expected output

The answers applied, and a short list in your report of each decision: the
question, the answer, and where it is recorded. Items still open are listed as
`TODO`s.

## References

- [AGENTS.md](../../../AGENTS.md#asking-the-human),
  [CONTRIBUTING.md#asking-the-human](../../../CONTRIBUTING.md#asking-the-human)
- [ADR-003](../../../decisions/ADR-003-agent-workflow-and-approvals.md)

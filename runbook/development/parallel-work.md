# Working in parallel (worktrees)

## When to use

Before starting any task, and whenever more than one person or AI agent works in
this clone at the same time. Code is separated by git worktrees.

## Prerequisites

- A clone of the repository with `origin` configured.
- `pnpm hooks` run once in that clone (it installs the `commit-msg` hook; see
  step 2).

## Steps

### 1. Look before you start

```sh
git worktree list     # every checkout of this clone and the branch it holds
```

| You see                                          | It means                                                 | Do                                                                      |
| ------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| A worktree already holds the branch of your task | The task was started before (a branch has one worktree). | Continue in that worktree. Do not create a second one.                  |
| Uncommitted changes there that you did not make  | Someone's work in progress.                              | Leave them. Ask the human before changing, resetting, or cleaning them. |

### 2. One task, one branch, one worktree

```sh
git fetch origin main
git worktree add -b feat/<slug> ../se-client-kit-worktrees/feat-<slug> origin/main
cd ../se-client-kit-worktrees/feat-<slug>
```

Worktrees live beside the clone, in
`../se-client-kit-worktrees/<branch with / as ->`, never inside it. Work only in
your task's worktree; the main checkout stays on `main`. Never edit, reset, or
clean another worktree.

`node_modules` and the wireit cache (`.wireit`) are per worktree. Run
`pnpm install --frozen-lockfile` once in each new worktree before `pnpm check`;
pnpm's content-addressable store is shared, so it is fast.

The git hooks are set once per clone, not per worktree: `pnpm hooks` sets
`core.hooksPath` to `.githooks` in the clone's shared git config, and every
worktree then runs the `commit-msg` hook of its own checkout. If you have not
run it in this clone yet, run it once. Never bypass the hook (`--no-verify`) to
get an AI attribution into a commit message. `core.hooksPath` is relative, so a
worktree on a branch cut before the hook was added has no `.githooks/` and runs
no hook, with no warning; base new branches on a current `origin/main`.

### 3. Finish a task

Clean up when the pull request is merged or the task is abandoned. A human
decides that; an agent cleans up only when asked. From the main checkout:

```sh
git pull --ff-only                                            # bring main up to date
git worktree remove ../se-client-kit-worktrees/feat-<slug>    # refuses if it has uncommitted changes
git branch -d feat/<slug>                                     # the local branch
git fetch --prune                                             # drop refs of branches deleted on origin
```

`git branch -d` deletes a branch only when git can see it as merged. After a
**squash merge** it answers `not fully merged`: check that the pull request is
merged, then use `git branch -D feat/<slug>`. For an abandoned task `-D` throws
the commits away, so make sure nothing on the branch is still wanted. The branch
on `origin` is deleted on GitHub; deleting it from here is a `git push` and
needs the same approval as any push.

## Verification

```sh
git worktree list     # your task has exactly one worktree
```

## Troubleshooting

| Symptom                                                                       | Cause / fix                                                          |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `fatal: '<branch>' is already used by worktree at ...`                        | The branch has a worktree already. Work there (`git worktree list`). |
| A worktree still shows in `git worktree list` after its directory was deleted | `git worktree prune`.                                                |

## Escalation

Ask the maintainers.

## References

- [`AGENTS.md`](../../AGENTS.md),
  [`CONTRIBUTING.md`](../../CONTRIBUTING.md#branching-commits-and-pull-requests)

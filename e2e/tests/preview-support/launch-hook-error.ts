// The launch hook's one error (RFC-002, "The launch hook"). The Node errors from
// running a child process carry the command and the child's standard error in
// their message, and either can hold a credential. So the suite never rethrows
// one: it throws this, which holds an exit code (or none) and a reason from a
// closed set, and a message made of those two and nothing else. It has no
// `cause`, and nothing the hook printed.

export type LaunchHookReason = "start" | "exit" | "timeout" | "output" | "line";

export class LaunchHookError extends Error {
  readonly reason: LaunchHookReason;
  readonly exitCode: number | undefined;

  constructor(reason: LaunchHookReason, exitCode?: number) {
    super(
      exitCode === undefined
        ? `the launch hook failed (${reason})`
        : `the launch hook failed (${reason}, exit code ${String(exitCode)})`,
    );
    this.name = "LaunchHookError";
    this.reason = reason;
    this.exitCode = exitCode;
  }
}

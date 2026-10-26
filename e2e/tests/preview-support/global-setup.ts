// The preview run's global setup (RFC-002, "Safety"): before any browser starts,
// the suite re-parses the variables and checks the environment document the
// stack serves. A `production` or `local` document, an origin off the
// allow-list, or a game origin the document does not list stops the run here,
// naming the check or the origin only. Then the best-effort build-identity
// report (Q6): a mismatch is printed and never fails the run.
//
// Playwright runs this only in the runner, once, and the config adds it only
// when the entry marker is set. Each test's fixture reads the document again,
// since a worker cannot share memory with this process and no file is written.

import { buildIdentityReport } from "./build-identity.ts";
import { loadPreviewDocument } from "./environment-document.ts";
import { parsePreviewEnvironment } from "./preview-environment.ts";

const globalSetup = async (): Promise<void> => {
  const environment = parsePreviewEnvironment(process.env);
  await loadPreviewDocument(environment);
  const report = await buildIdentityReport(environment);
  if (report !== undefined) process.stderr.write(`${report}\n`);
};

export default globalSetup;

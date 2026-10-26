// The one place a worker of the preview project reads the process environment:
// the variables the launcher handed on, parsed again (the config parsed them in
// the runner; a worker cannot share memory with it, and a reporter may print the
// project's metadata, which is not for a hook's path). Refused unless the entry
// marker is set, as the config refuses.

import { previewRefusal } from "./preview-config.ts";
import {
  PREVIEW_ENTRY_VALUE,
  PREVIEW_ENTRY_VARIABLE,
  type PreviewEnvironment,
  parsePreviewEnvironment,
} from "./preview-environment.ts";

export const previewEnvironmentFromProcess = (): PreviewEnvironment => {
  if (process.env[PREVIEW_ENTRY_VARIABLE] !== PREVIEW_ENTRY_VALUE) {
    throw previewRefusal();
  }
  return parsePreviewEnvironment(process.env);
};

export type { PreviewEnvironment };

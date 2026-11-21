// Syncing the in-memory source into a package directory, for the tests of
// the sync (tools/contracts-lock.ts and tools/contracts-notices.ts).

import {
  applySync,
  planSync,
  readLock,
  type SourceReader,
} from "../contracts-lock.ts";
import { lockedFilesIn } from "../contracts-notices.ts";
import { type MemorySource, SOURCES } from "./contracts-memory-source.ts";

export const syncWith = (
  packageDir: string,
  reader: SourceReader,
  allowVectorChange = false,
): void => {
  applySync(
    packageDir,
    planSync(
      SOURCES,
      readLock(packageDir).entries,
      reader,
      { allowVectorChange },
      lockedFilesIn(packageDir),
    ),
  );
};

export const syncInto = (
  packageDir: string,
  source: MemorySource,
  allowVectorChange = false,
): void => {
  syncWith(packageDir, source.reader, allowVectorChange);
};

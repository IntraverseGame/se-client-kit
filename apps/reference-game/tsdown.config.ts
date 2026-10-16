import { defineConfig } from "tsdown";

import { base } from "../../tsdown.base.ts";

// An app: nothing imports its types, so no declaration files.
export default defineConfig({
  ...base,
  dts: false,
  entry: { index: "src/index.ts" },
});

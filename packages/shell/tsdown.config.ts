import { defineConfig } from "tsdown";

import { base } from "../../tsdown.base.ts";

// Two entries: the main one, and the type-only `controller` subpath (the
// `se.controller/1` message types for a game). The subpath emits declarations
// and an empty module; tools/build-output.ts proves it has no runtime code.
export default defineConfig({
  ...base,
  entry: { index: "src/index.ts", controller: "src/controller.ts" },
});

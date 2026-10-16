import { defineConfig } from "tsdown";

import { base } from "../../tsdown.base.ts";

export default defineConfig({ ...base, entry: { index: "src/index.ts" } });

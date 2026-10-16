import { defineConfig } from "@playwright/test";

// No suites yet. They run against the built Wrapper and the in-repo fake Play
// API, with no real network (specs/client-kit.md, "Testing and CI").
export default defineConfig({
  testDir: "./tests",
  forbidOnly: true,
  fullyParallel: true,
  reporter: [["list"]],
});

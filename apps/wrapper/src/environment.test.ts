import { describe, expect, it } from "vitest";

// The Wrapper's component tests run in jsdom (ADR-001). This proves the
// environment is wired; it tests no Wrapper behavior.
describe("jsdom test environment", () => {
  it("provides a DOM", () => {
    const element = document.createElement("div");
    element.textContent = "ok";
    document.body.append(element);
    expect(document.body.textContent).toBe("ok");
  });
});

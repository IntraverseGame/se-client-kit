// T-23 (#146, W-56): the RTP as a percent, from `rtp.decimal` by string
// operations only: the spec's five examples, and a value outside the schema's
// pattern shows nothing.

import { describe, expect, it } from "vitest";

import { rtpPercent } from "./rtp.ts";

describe("rtpPercent (W-56)", () => {
  it.each([
    ["0.9600", "96.00"],
    ["0.0500", "5.00"],
    ["0.0050", "0.50"],
    ["0.0000", "0.00"],
    ["1.0000", "100.00"],
    ["0.9999", "99.99"],
    ["0.1234", "12.34"],
  ])("shows %s as %s%%", (decimal, percent) => {
    expect(rtpPercent(decimal)).toBe(percent);
  });

  it("shows nothing for a value outside the schema's pattern", () => {
    for (const bad of ["0.96", "2.0000", "0.96000", "", ".9600", "0.96a0"]) {
      expect(rtpPercent(bad)).toBeUndefined();
    }
  });
});

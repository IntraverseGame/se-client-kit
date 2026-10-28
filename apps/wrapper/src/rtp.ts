// The mode's return to player (W-56): `config.rtp.decimal` of a book round,
// shown as a percent with two fraction digits, by string operations only,
// never through a number. The decimal is an integer digit (`0` or `1`), a
// point, and four digits `abcd` (the schema's pattern); the percent is the
// integer digit followed by `ab`, with leading zeros removed but one digit
// kept, then a point, then `cd`: "0.9600" is "96.00", "0.0500" is "5.00",
// "0.0050" is "0.50", "0.0000" is "0.00", and "1.0000" is "100.00". The
// Wrapper never shows or computes with `rtp.fraction`.

const DECIMAL = /^([01])\.(\d{2})(\d{2})$/u;

/**
 * The percent of a `rtp.decimal` ("96.00" for "0.9600"), or `undefined` for a
 * value outside the schema's pattern (the validator rules it out; the guard
 * keeps a bad value from being shown).
 */
export const rtpPercent = (decimal: string): string | undefined => {
  const match = DECIMAL.exec(decimal);
  if (match === null) return undefined;
  const [, whole = "", ab = "", cd = ""] = match;
  const integer = `${whole}${ab}`.replace(/^0+(?=\d)/u, "");
  return `${integer}.${cd}`;
};

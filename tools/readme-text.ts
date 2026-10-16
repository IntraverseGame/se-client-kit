// Text folding for the README word checks: NFKC (so fullwidth and other
// compatibility forms become plain letters), zero-width and bidi control
// characters removed, a small set of common Cyrillic and Greek lookalikes mapped
// to Latin, whitespace runs (spaces, tabs, newlines, no-break space) folded to
// one space, and case folded. A full confusables check is not attempted: other
// cross-script lookalikes are left to review.

const INVISIBLE = /[­​-‏‪-‮⁠-⁤⁦-⁩﻿]/gu;

const LOOKALIKES: Readonly<Record<string, string>> = {
  // Cyrillic
  А: "a",
  В: "b",
  Е: "e",
  К: "k",
  М: "m",
  Н: "h",
  О: "o",
  Р: "p",
  С: "c",
  Т: "t",
  Х: "x",
  У: "y",
  І: "i",
  Ј: "j",
  Ѕ: "s",
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  х: "x",
  у: "y",
  і: "i",
  ј: "j",
  ѕ: "s",
  ѵ: "v",
  ԁ: "d",
  ԛ: "q",
  // Greek
  Α: "a",
  Β: "b",
  Ε: "e",
  Ζ: "z",
  Η: "h",
  Ι: "i",
  Κ: "k",
  Μ: "m",
  Ν: "n",
  Ο: "o",
  Ρ: "p",
  Τ: "t",
  Υ: "y",
  Χ: "x",
  ο: "o",
  ν: "v",
  ρ: "p",
  τ: "t",
  υ: "u",
  ι: "i",
  κ: "k",
  χ: "x",
};

export const foldForMatching = (text: string): string =>
  [...text.normalize("NFKC").replaceAll(INVISIBLE, "")]
    .map(char => LOOKALIKES[char] ?? char)
    .join("")
    .replaceAll(/\s+/gu, " ")
    .toLowerCase();

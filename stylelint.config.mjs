// Stylelint checks correctness and the project's constraints only. oxfmt owns
// formatting, so no stylistic rule is enabled here (stylelint has none in core).
// No shared config package: every rule is explicit (ADR-001 keeps the
// dependency list small).

/** @type {import("stylelint").Config} */
export default {
  ignoreFiles: ["**/dist/**", "**/.wireit/**", "**/node_modules/**"],
  reportInvalidScopeDisables: true,
  reportNeedlessDisables: true,
  rules: {
    // Unknown or invalid things.
    "property-no-unknown": true,
    "at-rule-no-unknown": true,
    "selector-pseudo-class-no-unknown": true,
    "selector-pseudo-element-no-unknown": true,
    "selector-type-no-unknown": true,
    "unit-no-unknown": true,
    "function-no-unknown": true,
    "media-feature-name-no-unknown": true,
    "media-query-no-invalid": true,
    "declaration-property-value-no-unknown": true,
    "color-no-invalid-hex": true,
    "custom-property-no-missing-var-function": true,
    "function-calc-no-unspaced-operator": true,
    "named-grid-areas-no-invalid": true,
    "string-no-newline": true,
    "no-invalid-double-slash-comments": true,
    "no-invalid-position-at-import-rule": true,
    "no-irregular-whitespace": true,

    // Duplicates and dead code.
    "no-duplicate-selectors": true,
    "no-duplicate-at-import-rules": true,
    "no-descending-specificity": true,
    "declaration-block-no-duplicate-properties": true,
    "declaration-block-no-duplicate-custom-properties": true,
    "declaration-block-no-shorthand-property-overrides": true,
    "keyframe-block-no-duplicate-selectors": true,
    "font-family-no-duplicate-names": true,
    "font-family-no-missing-generic-family-keyword": true,
    "block-no-empty": true,
    "comment-no-empty": true,

    // Project constraints.
    // No !important, which would also fight a future theming layer.
    "declaration-no-important": true,
    "keyframe-declaration-no-important": true,
    // The Wrapper runs under a strict CSP and is served from the SuperEngine
    // origin: no remote stylesheet, font, or image. Only data: URLs are allowed
    // (relative URLs have no scheme and stay within the origin).
    "function-url-scheme-allowed-list": [
      ["data"],
      {
        message:
          "Only same-origin relative URLs and data: URLs are allowed; the Wrapper's CSP forbids remote resources.",
      },
    ],
    "function-url-no-scheme-relative": true,
    // Stylesheets are loaded through the bundler, so no @import (this also
    // rules out a remote `@import url(...)` or `@import "https://..."`).
    "at-rule-disallowed-list": [
      ["import"],
      {
        message:
          "No @import: import the stylesheet from the entry module so the bundler resolves it.",
      },
    ],
    // No vendor-prefix noise; the build targets modern browsers.
    "property-no-vendor-prefix": true,
    "value-no-vendor-prefix": true,
    "selector-no-vendor-prefix": true,
    "at-rule-no-vendor-prefix": true,
    "media-feature-name-no-vendor-prefix": true,
  },
};

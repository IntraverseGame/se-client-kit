// How the config decides on the `preview` project (RFC-002): defined only under
// the launcher's entry marker; asked for without it (a bare `--project=preview`,
// `--project preview`, `SE_E2E_PROJECT=preview`) it is refused with a message
// that names the script; and with the marker a missing or malformed variable
// fails with its name. Without the marker, a run of the fake projects never
// reads the variables (a source that holds none of them is not an error).

import { expect, test } from "../harness/worker-browser.ts";
import {
  PREVIEW_SCRIPT,
  previewSetup,
  requestsPreview,
} from "../preview-support/preview-config.ts";
import {
  PREVIEW_ENTRY_VALUE,
  PREVIEW_ENTRY_VARIABLE,
  PreviewEnvironmentError,
} from "../preview-support/preview-environment.ts";

const VARIABLES = {
  SE_E2E_PREVIEW_ORIGIN: "https://preview.example.test",
  SE_E2E_PREVIEW_LAUNCH_COMMAND: "/opt/runner/launch-hook",
  SE_E2E_PREVIEW_GAME_ORIGIN: "https://game.example-games.test",
  SE_E2E_PREVIEW_ALLOWED_ORIGINS: "https://rpc.example.test",
};

type ActiveSetup = Extract<ReturnType<typeof previewSetup>, { active: true }>;

/** The setup under the marker, which must be defined. */
const active = (
  env: Parameters<typeof previewSetup>[0],
  argv: readonly string[],
): ActiveSetup => {
  const setup = previewSetup(env, argv);
  if (!setup.active) throw new Error("the preview project is not defined");
  return setup;
};

const ENTERED = { ...VARIABLES, [PREVIEW_ENTRY_VARIABLE]: PREVIEW_ENTRY_VALUE };

test.describe("the preview project's definition", () => {
  test("is not defined without the marker, whatever the variables", () => {
    expect(previewSetup({}, ["test", "--project=chromium"])).toEqual({
      active: false,
    });
    expect(previewSetup(VARIABLES, [])).toEqual({ active: false });
    expect(previewSetup({ SE_E2E_PROJECT: "firefox" }, [])).toEqual({
      active: false,
    });
  });

  test("never reads the variables without the marker: malformed ones are no error", () => {
    expect(
      previewSetup({ SE_E2E_PREVIEW_ORIGIN: "not an origin" }, []),
    ).toEqual({ active: false });
  });

  test.describe("is refused, naming the script, when asked for without the marker", () => {
    const ARGUMENTS: readonly [
      string,
      readonly string[],
      Record<string, string>,
    ][] = [
      ["--project=preview", ["test", "--project=preview"], {}],
      ["--project preview", ["test", "--project", "preview"], {}],
      [
        "--project chromium preview",
        ["test", "--project", "chromium", "preview"],
        {},
      ],
      ["-p preview", ["test", "-p", "preview"], {}],
      ["a different case", ["test", "--project=Preview"], {}],
      [
        "SE_E2E_PROJECT=preview",
        ["test", "--project=preview"],
        { SE_E2E_PROJECT: "preview" },
      ],
      ["SE_E2E_PROJECT alone", ["test"], { SE_E2E_PROJECT: "preview" }],
      [
        "the variables set but no marker",
        ["test", "--project=preview"],
        VARIABLES,
      ],
    ];
    for (const [name, argv, env] of ARGUMENTS) {
      test(name, () => {
        expect(() => previewSetup(env, argv)).toThrow(PREVIEW_SCRIPT);
      });
    }
  });

  test("does not take a test filter or another flag's value for the project", () => {
    expect(requestsPreview(["test", "preview"], {})).toBe(false);
    expect(requestsPreview(["test", "--reporter", "preview"], {})).toBe(false);
    expect(requestsPreview(["test", "--project=chromium", "preview"], {})).toBe(
      false,
    );
    expect(requestsPreview(["test", "--grep", "preview"], {})).toBe(false);
  });

  test("is defined under the marker, from the validated variables", () => {
    const setup = active(ENTERED, ["test", "--project=preview"]);
    expect(setup.environment.origin).toBe("https://preview.example.test");
    expect(setup.environment.allowedOrigins).toEqual([
      "https://preview.example.test",
      "https://rpc.example.test",
    ]);
    expect(setup.browserArgs).toEqual([
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE preview.example.test, EXCLUDE rpc.example.test",
    ]);
    // The test's source holds no allow-listed name, so the browser gets none.
    expect(setup.browserEnv).toEqual({});
  });

  test("fails under the marker, naming the variable, when one is missing", () => {
    const { SE_E2E_PREVIEW_ORIGIN: _origin, ...without } = ENTERED;
    expect(() => previewSetup(without, [])).toThrow(PreviewEnvironmentError);
    expect(() => previewSetup(without, [])).toThrow("SE_E2E_PREVIEW_ORIGIN");
  });

  test("gives the browser an environment of the allow-listed names only", () => {
    const setup = active(
      { ...ENTERED, PATH: "/usr/bin", SECRET_TOKEN: "SENTINEL" },
      [],
    );
    expect(setup.browserEnv).toEqual({ PATH: "/usr/bin" });
  });
});

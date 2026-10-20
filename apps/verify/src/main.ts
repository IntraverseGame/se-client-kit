// The verify page's module entry (`index.html` loads it): mounts the page into
// `#verify-root` on the real `window`. All behavior lives in `start-page.ts`.

import { startVerifyPage } from "./start-page.ts";

startVerifyPage(window);

// The signing page's module entry (`index.html` loads it): runs the page on the
// real `window`. All behavior lives in `signing-page.ts`.

import { startSigningPage } from "./start-page.ts";

startSigningPage(window);

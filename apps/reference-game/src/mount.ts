// Puts the game on a page: the controller (game.ts) and the page (render.ts),
// joined. Everything from the browser is passed in, so the component tests run
// it in jsdom with a fake parent window.

import { createGame, type Game, type GameOptions } from "./game.ts";
import { createPage } from "./render.ts";

export type MountOptions = Omit<GameOptions, "onView"> & {
  readonly doc: Document;
  readonly host: HTMLElement;
};

export const mountGame = (options: MountOptions): Game => {
  const page = createPage(options.doc, options.host);
  const game = createGame({
    parent: options.parent,
    parentOrigin: options.parentOrigin,
    listen: options.listen,
    onView: page.show,
  });
  page.onCall(game.pick);
  page.onTile(game.pickTile);
  return game;
};

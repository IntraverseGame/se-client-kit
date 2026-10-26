// Builds elements with `createElement` and `setAttribute` only, and puts text in
// as text: no markup string and no inline style.

export type ElementBuilder = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string>>,
  children?: readonly (Node | string)[],
) => HTMLElementTagNameMap[K];

export const elementBuilder =
  (doc: Document): ElementBuilder =>
  (tag, attributes, children = []) => {
    const element = doc.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }
    element.append(...children);
    return element;
  };

export {};

declare global {
  interface Document {
    querySelector(selectors: ".workspace"): HTMLElement | null;
    querySelector<E extends Element = Element>(selectors: string): E | null;
  }
}

export {};

declare global {
  interface Document {
    querySelector(selectors: ".workspace"): HTMLElement | null;
  }
}

import "@testing-library/jest-dom";

// jsdom não implementa ResizeObserver; componentes Radix (ex.: Checkbox) medem o próprio tamanho com ele
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??=
  ResizeObserverStub as unknown as typeof ResizeObserver;

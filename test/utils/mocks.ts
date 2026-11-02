import type { Mock } from 'vitest';

// Mock de uma porta com cada metodo como propriedade vi.fn() tipada pela interface.
// Usar propriedades (e nao metodos) evita falso positivo do lint unbound-method
// em `expect(port.metodo).toHaveBeenCalled()`.
export type MockPort<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? Mock<T[K]> : T[K];
};

// Handler de rota de um controller, para ler metadados sem referenciar metodo solto.
export const handlerOf = <T extends object>(
  controller: abstract new (...args: any[]) => T,
  method: keyof T & string,
): ((...args: unknown[]) => unknown) =>
  Reflect.get(controller.prototype as object, method) as (
    ...args: unknown[]
  ) => unknown;

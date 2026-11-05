export const TRACING = Symbol('TRACING');

// Atributos de span podem ter alta cardinalidade (ids), ao contrário de labels de métrica.
export type SpanAttributes = Record<string, string | number | boolean>;

export interface ActiveSpan {
  setAttributes(attributes: SpanAttributes): void;
}

export interface TracingPort {
  // Executa `work` dentro de um span filho do atual (queries feitas dentro dele viram filhas dele).
  // O resultado e as exceções de `work` são repassados sem alteração.
  inSpan<T>(
    name: string,
    attributes: SpanAttributes,
    work: (span: ActiveSpan) => Promise<T>,
  ): Promise<T>;
}

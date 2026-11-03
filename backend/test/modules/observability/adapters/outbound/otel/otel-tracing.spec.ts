import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SpanStatusCode } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { OtelTracing } from '../../../../../../src/modules/observability/adapters/outbound/otel/otel-tracing.js';

describe('OtelTracing', () => {
  let exporter: InMemorySpanExporter;
  let provider: TracerProvider;
  let tracing: OtelTracing;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new TracerProvider({
      spanProcessors: [new SimpleSpanProcessor({ exporter })],
    });
    tracing = new OtelTracing(provider.getTracer('test'));
  });

  afterEach(async () => {
    await provider.shutdown();
  });

  const finishedSpan = () => {
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    return spans[0];
  };

  it('cria o span com nome e atributos, inclui os setados durante o trabalho e devolve o resultado', async () => {
    const result = await tracing.inSpan(
      'ticket.reserve',
      { 'event.id': 10 },
      async (span) => {
        span.setAttributes({ outcome: 'reserved' });
        return 'ok';
      },
    );

    expect(result).toBe('ok');
    const span = finishedSpan();
    expect(span.name).toBe('ticket.reserve');
    expect(span.attributes).toEqual({ 'event.id': 10, outcome: 'reserved' });
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('relança erro 4xx sem marcar o span como erro, mas registra a exceção', async () => {
    const error = new ConflictException('esgotado');

    await expect(
      tracing.inSpan('ticket.reserve', {}, () => Promise.reject(error)),
    ).rejects.toBe(error);

    const span = finishedSpan();
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
    expect(span.events.map((e) => e.name)).toEqual(['exception']);
  });

  it('marca o span como erro em falha inesperada', async () => {
    const error = new Error('banco fora');

    await expect(
      tracing.inSpan('ticket.reserve', {}, () => Promise.reject(error)),
    ).rejects.toBe(error);

    expect(finishedSpan().status).toEqual({
      code: SpanStatusCode.ERROR,
      message: 'banco fora',
    });
  });

  it('trata 5xx do Nest como erro', async () => {
    await expect(
      tracing.inSpan('ticket.reserve', {}, () =>
        Promise.reject(new InternalServerErrorException()),
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(finishedSpan().status.code).toBe(SpanStatusCode.ERROR);
  });
});

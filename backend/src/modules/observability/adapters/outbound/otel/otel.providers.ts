import {Provider} from "@nestjs/common";
import {metrics, trace} from "@opentelemetry/api";

// Nome do "instrumentation scope" das métricas e spans manuais do app
// (vira o label otel_scope_name no Prometheus e o scope no Tempo).
export const INSTRUMENTATION_SCOPE = 'bilheteria-backend';

// Meter e Tracer do OpenTelemetry injetáveis: os adapters recebem por DI e os testes passam
// um MeterProvider/TracerProvider em memória. Sem o SDK carregado (testes, OTEL_SDK_DISABLED)
// a API devolve implementações no-op.
export const OTEL_METER = Symbol('OTEL_METER');
export const OTEL_TRACER = Symbol('OTEL_TRACER');

export const otelProviders: Provider[] = [
    {provide: OTEL_METER, useFactory: () => metrics.getMeter(INSTRUMENTATION_SCOPE)},
    {provide: OTEL_TRACER, useFactory: () => trace.getTracer(INSTRUMENTATION_SCOPE)},
];

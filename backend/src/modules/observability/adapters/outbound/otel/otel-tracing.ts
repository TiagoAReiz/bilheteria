import {HttpException, Inject, Injectable} from "@nestjs/common";
import {SpanStatusCode, type Tracer} from "@opentelemetry/api";
import {ActiveSpan, SpanAttributes, TracingPort} from "../../../application/ports/outbound/tracing/tracing.port.js";
import {OTEL_TRACER} from "./otel.providers.js";

// Erro de regra de negócio (4xx) é resultado esperado: fica registrado no span como evento,
// mas não marca o span como erro, senão o service graph e as span metrics contariam
// "ingresso esgotado" como falha do sistema.
const isClientError = (error: unknown): boolean =>
    error instanceof HttpException && error.getStatus() < 500;

@Injectable()
export class OtelTracing implements TracingPort {
    constructor(@Inject(OTEL_TRACER) private readonly tracer: Tracer) {}

    inSpan<T>(name: string, attributes: SpanAttributes, work: (span: ActiveSpan) => Promise<T>): Promise<T> {
        return this.tracer.startActiveSpan(name, {attributes}, async (span) => {
            try {
                return await work(span);
            } catch (error) {
                span.recordException(error instanceof Error ? error : String(error));
                if (!isClientError(error)) {
                    span.setStatus({code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : undefined});
                }
                throw error;
            } finally {
                span.end();
            }
        });
    }
}

import { Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import {
  OTEL_METER,
  otelProviders,
} from './adapters/outbound/otel/otel.providers.js';
import { OtelTracing } from './adapters/outbound/otel/otel-tracing.js';
import { shutdownTelemetry } from './adapters/outbound/otel/telemetry-lifecycle.js';
import {
  buildPinoHttpOptions,
  loggingSettings,
} from './adapters/outbound/logging/pino-http.options.js';
import { TRACING } from './application/ports/outbound/tracing/tracing.port.js';

// Infra de observabilidade compartilhada: logger (pino), Meter para os adapters de métricas
// de cada módulo e a porta de tracing. O SDK em si é iniciado no src/instrumentation.ts.
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: buildPinoHttpOptions(
          loggingSettings(
            config.get<string>('NODE_ENV'),
            config.get<string>('LOG_LEVEL'),
          ),
        ),
      }),
    }),
  ],
  providers: [...otelProviders, { provide: TRACING, useClass: OtelTracing }],
  exports: [OTEL_METER, TRACING],
})
export class ObservabilityModule implements OnApplicationShutdown {
  // roda depois de o Nest fechar o servidor HTTP: envia o que restou em buffer
  async onApplicationShutdown() {
    await shutdownTelemetry();
  }
}

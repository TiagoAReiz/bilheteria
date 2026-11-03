// Carregado ANTES do app com `node --import ./dist/instrumentation.js` (ver scripts do package.json).
// Precisa rodar primeiro para conseguir aplicar os patches em http, express, pg e pino antes de serem importados.
//
// Tudo é configurável pelas variáveis OTEL_* padrão (OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_SDK_DISABLED...).
// Com OTEL_SDK_DISABLED=true nada é registrado e o app roda sem telemetria.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {NodeSDK} from '@opentelemetry/sdk-node';
import {getNodeAutoInstrumentations} from '@opentelemetry/auto-instrumentations-node';
import {ExpressLayerType} from '@opentelemetry/instrumentation-express';
import {OTLPTraceExporter} from '@opentelemetry/exporter-trace-otlp-proto';
import {OTLPMetricExporter} from '@opentelemetry/exporter-metrics-otlp-proto';
import {OTLPLogExporter} from '@opentelemetry/exporter-logs-otlp-proto';
import {PeriodicExportingMetricReader} from '@opentelemetry/sdk-metrics';
import {BatchLogRecordProcessor} from '@opentelemetry/sdk-logs';
import {defaultResource, resourceFromAttributes} from '@opentelemetry/resources';
import {ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION} from '@opentelemetry/semantic-conventions';
import {PrismaInstrumentation} from '@prisma/instrumentation';
import {registerTelemetryShutdown} from './modules/observability/adapters/outbound/otel/telemetry-lifecycle.js';

const SERVICE_NAME = 'bilheteria-backend';
const DEFAULT_METRIC_EXPORT_INTERVAL_MS = 15_000;

function isDisabled(): boolean {
    return process.env.OTEL_SDK_DISABLED?.trim().toLowerCase() === 'true';
}

function serviceVersion(): string {
    // dist/instrumentation.js e src/instrumentation.ts ficam um nível abaixo do package.json
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {version: string};
    return pkg.version;
}

function metricExportIntervalMs(): number {
    const fromEnv = Number(process.env.OTEL_METRIC_EXPORT_INTERVAL);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_METRIC_EXPORT_INTERVAL_MS;
}

function createSdk(): NodeSDK {
    const environment = process.env.NODE_ENV ?? 'development';

    // Os exporters OTLP/HTTP leem OTEL_EXPORTER_OTLP_ENDPOINT (default http://localhost:4318, o Alloy)
    // e acrescentam /v1/traces, /v1/metrics e /v1/logs. Falha de envio só gera log de diagnóstico.
    return new NodeSDK({
        resource: defaultResource().merge(resourceFromAttributes({
            [ATTR_SERVICE_NAME]: SERVICE_NAME,
            [ATTR_SERVICE_VERSION]: serviceVersion(),
            // identifica este processo: vira o label "instance" no Prometheus e separa réplicas/restarts
            'service.instance.id': randomUUID(),
            // nome atual da semconv e o antigo, que alguns painéis/labels do Loki ainda usam
            'deployment.environment.name': environment,
            'deployment.environment': environment,
        })),
        traceExporter: new OTLPTraceExporter(),
        metricReaders: [new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter(),
            exportIntervalMillis: metricExportIntervalMs(),
        })],
        // logs do pino chegam aqui pela instrumentation-pino (log sending) e saem via OTLP para o Loki
        logRecordProcessors: [new BatchLogRecordProcessor({exporter: new OTLPLogExporter()})],
        instrumentations: [
            getNodeAutoInstrumentations({
                // ruidosas: um span por leitura de arquivo, lookup DNS ou socket
                '@opentelemetry/instrumentation-fs': {enabled: false},
                '@opentelemetry/instrumentation-dns': {enabled: false},
                '@opentelemetry/instrumentation-net': {enabled: false},
                // só suporta @nestjs/core < 12; os spans de rota já vêm do express
                '@opentelemetry/instrumentation-nestjs-core': {enabled: false},
                // o express 5 roteia pelo pacote router: a instrumentação dele duplicaria os spans do express
                '@opentelemetry/instrumentation-router': {enabled: false},
                '@opentelemetry/instrumentation-express': {
                    // um span por middleware (cors, parsers, pino-http...) em toda requisição é ruído;
                    // fica só o handler da rota, que é o que dá o http.route
                    ignoreLayersType: [ExpressLayerType.MIDDLEWARE],
                },
                '@opentelemetry/instrumentation-pg': {
                    // nunca coloca os valores dos parâmetros (CPF hash, ids de usuário) no span
                    enhancedDatabaseReporting: false,
                    // sem span de pg.connect solto, fora de uma requisição
                    requireParentSpan: true,
                },
                '@opentelemetry/instrumentation-http': {
                    // os headers não vão para o span; query string do callback OAuth também não
                    redactedQueryParamsServer: ['code', 'state', 'token'],
                },
            }),
            new PrismaInstrumentation(),
        ],
    });
}

function start(): void {
    // O app é ESM, mas o que instrumentamos (http, express, pg, pino) é CommonJS e, no Node 24, é carregado
    // pelo require do CJS mesmo quando importado de ESM: o require-in-the-middle do SDK basta.
    // O loader ESM do import-in-the-middle foi testado e descartado: só somava spans duplicados de
    // middleware e tempo de boot. Se um dia instrumentarmos um pacote ESM puro, ele volta a ser necessário.
    const sdk = createSdk();
    sdk.start();

    // Quem encerra é o Nest (enableShutdownHooks): no SIGTERM ele fecha o app e chama o onApplicationShutdown
    // do ObservabilityModule, que faz o flush dos últimos spans/métricas/logs por aqui. Assim o SDK
    // termina depois do app, e não em paralelo com ele.
    registerTelemetryShutdown(() => sdk.shutdown());
}

if (!isDisabled()) {
    start();
}

import type { Attributes, Meter } from '@opentelemetry/api';
import {
  AggregationTemporality,
  DataPointType,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type MetricData,
} from '@opentelemetry/sdk-metrics';

// MeterProvider em memória: os adapters de métricas recebem `meter` e o teste lê
// o que seria exportado via OTLP (nome, unidade, atributos e valores).
export type InMemoryMetrics = {
  meter: Meter;
  collect(): Promise<MetricData[]>;
  shutdown(): Promise<void>;
};

export const createInMemoryMetrics = (): InMemoryMetrics => {
  const exporter = new InMemoryMetricExporter(
    AggregationTemporality.CUMULATIVE,
  );
  // intervalo longo: só exporta quando o teste pede (forceFlush)
  const reader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: 60 * 60 * 1000,
  });
  const provider = new MeterProvider({ readers: [reader] });

  return {
    meter: provider.getMeter('test'),
    async collect() {
      exporter.reset();
      await reader.forceFlush();
      return exporter
        .getMetrics()
        .flatMap((resource) => resource.scopeMetrics)
        .flatMap((scope) => scope.metrics);
    },
    shutdown: () => provider.shutdown(),
  };
};

export const findMetric = (
  metrics: MetricData[],
  name: string,
): MetricData => {
  const metric = metrics.find((m) => m.descriptor.name === name);
  if (!metric) {
    throw new Error(
      `métrica ${name} não encontrada; existentes: ${metrics.map((m) => m.descriptor.name).join(', ')}`,
    );
  }
  return metric;
};

// pontos de um counter: [{ attributes, value }]
export const sumPoints = (
  metric: MetricData,
): { attributes: Attributes; value: number }[] => {
  if (metric.dataPointType !== DataPointType.SUM) {
    throw new Error(`${metric.descriptor.name} não é um counter`);
  }
  return metric.dataPoints.map(({ attributes, value }) => ({
    attributes,
    value,
  }));
};

// pontos de um histograma: [{ attributes, count, sum }]
export const histogramPoints = (
  metric: MetricData,
): { attributes: Attributes; count: number; sum: number | undefined }[] => {
  if (metric.dataPointType !== DataPointType.HISTOGRAM) {
    throw new Error(`${metric.descriptor.name} não é um histograma`);
  }
  return metric.dataPoints.map(({ attributes, value }) => ({
    attributes,
    count: value.count,
    sum: value.sum,
  }));
};

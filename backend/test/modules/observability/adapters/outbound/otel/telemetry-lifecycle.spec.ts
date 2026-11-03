import {
  registerTelemetryShutdown,
  shutdownTelemetry,
} from '../../../../../../src/modules/observability/adapters/outbound/otel/telemetry-lifecycle.js';

describe('telemetry-lifecycle', () => {
  it('é no-op quando o SDK não foi registrado (testes, OTEL_SDK_DISABLED)', async () => {
    await expect(shutdownTelemetry()).resolves.toBeUndefined();
  });

  it('chama o shutdown registrado uma única vez', async () => {
    const shutdown = vi.fn().mockResolvedValue(undefined);
    registerTelemetryShutdown(shutdown);

    await shutdownTelemetry();
    await shutdownTelemetry();

    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it('não lança quando o shutdown falha (ex.: coletor fora do ar)', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    registerTelemetryShutdown(() => Promise.reject(new Error('ECONNREFUSED')));

    await expect(shutdownTelemetry()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

// Ponte entre o instrumentation.ts (carregado via --import, fora do Nest) e o ciclo de vida do app.
// Os dois importam este mesmo arquivo, então compartilham o estado abaixo. Sem efeitos colaterais:
// nos testes, onde o SDK não é carregado, o shutdown é um no-op.
type ShutdownFn = () => Promise<void>;

let shutdownFn: ShutdownFn | undefined;

export function registerTelemetryShutdown(fn: ShutdownFn): void {
    shutdownFn = fn;
}

// Envia o que ainda está em buffer (spans, métricas, logs) e encerra o SDK. Nunca lança:
// falha ao exportar não pode impedir o processo de terminar.
export async function shutdownTelemetry(): Promise<void> {
    const fn = shutdownFn;
    shutdownFn = undefined;
    try {
        await fn?.();
    } catch (error) {
        console.error('Falha ao encerrar o OpenTelemetry', error);
    }
}

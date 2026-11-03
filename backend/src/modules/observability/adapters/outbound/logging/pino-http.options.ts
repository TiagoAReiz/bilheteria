import type {IncomingMessage, ServerResponse} from "node:http";
import type {LevelWithSilent} from "pino";
import type {Options} from "pino-http";

export const REDACTED = '[REDACTED]';

// Nunca chegam ao stdout nem ao Loki. O redact age na serialização, antes de a linha ir para
// qualquer destino (console, pino-pretty ou o envio OTLP da instrumentation-pino).
export const REDACT_PATHS = [
    // sessão do Better Auth e qualquer credencial em header
    'req.headers.cookie',
    'req.headers.authorization',
    'res.headers["set-cookie"]',
    // dado pessoal e segredos em objetos logados manualmente (raiz ou um nível abaixo)
    ...['cpf', 'cpfHash', 'cpf_hash', 'password', 'secret', 'token', 'accessToken', 'refreshToken', 'idToken']
        .flatMap((key) => [key, `*.${key}`]),
];

export type LoggingSettings = {
    level: LevelWithSilent;
    // pino-pretty (legível, colorido) no terminal em dev; JSON por linha em produção
    pretty: boolean;
};

// NODE_ENV=test (vitest) silencia os logs por padrão; LOG_LEVEL sempre tem precedência
export function loggingSettings(nodeEnv = 'development', logLevel?: string): LoggingSettings {
    const defaultLevel: LevelWithSilent = nodeEnv === 'test' ? 'silent' : 'info';
    return {
        level: (logLevel as LevelWithSilent | undefined) ?? defaultLevel,
        pretty: nodeEnv !== 'production',
    };
}

// a query string pode carregar o `code`/`state` do callback OAuth
const withoutQuery = (url: string): string => url.split('?', 1)[0];

const levelFor = (res: ServerResponse, error?: Error): LevelWithSilent => {
    if (error || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
};

export function buildPinoHttpOptions(settings: LoggingSettings): Options<IncomingMessage, ServerResponse> {
    return {
        level: settings.level,
        redact: {paths: REDACT_PATHS, censor: REDACTED},
        customLogLevel: (_req, res, error) => levelFor(res, error),
        serializers: {
            req: (req: {id: unknown; method: string; url: string; params?: unknown; headers: unknown; remoteAddress?: string}) => ({
                id: req.id,
                method: req.method,
                url: withoutQuery(req.url),
                params: req.params,
                headers: req.headers,
                remoteAddress: req.remoteAddress,
            }),
        },
        // trace_id/span_id entram em cada linha pela instrumentation-pino (mixin), não aqui
        transport: settings.pretty
            ? {
                target: 'pino-pretty',
                options: {singleLine: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname'},
            }
            : undefined,
    };
}

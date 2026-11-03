import type { ServerResponse, IncomingMessage } from 'node:http';
import { pino } from 'pino';
import {
  buildPinoHttpOptions,
  loggingSettings,
  REDACTED,
} from '../../../../../../src/modules/observability/adapters/outbound/logging/pino-http.options.js';

// Loga com as mesmas opções do app (sem o transport) e devolve as linhas JSON.
const logWith = (log: (logger: pino.Logger) => void) => {
  const lines: Record<string, any>[] = [];
  // customLogLevel é do pino-http e o transport (pino-pretty) mandaria a saída para outro processo
  const {
    customLogLevel: _customLogLevel,
    transport: _transport,
    ...options
  } = buildPinoHttpOptions({
    level: 'info',
    pretty: false,
  });
  const logger = pino(options, {
    write: (line: string) => lines.push(JSON.parse(line)),
  });
  log(logger);
  return lines;
};

const response = (statusCode: number) => ({ statusCode }) as ServerResponse;
const request = {} as IncomingMessage;

describe('buildPinoHttpOptions', () => {
  describe('redact', () => {
    it('nunca loga cookie nem authorization da requisição', () => {
      const [line] = logWith((logger) =>
        logger.info(
          {
            req: {
              id: 1,
              method: 'GET',
              url: '/users/me',
              headers: {
                host: 'api',
                cookie: 'better-auth.session_token=abc',
                authorization: 'Bearer abc',
              },
            },
          },
          'request completed',
        ),
      );

      expect(line.req.headers).toEqual({
        host: 'api',
        cookie: REDACTED,
        authorization: REDACTED,
      });
    });

    it('nunca loga set-cookie da resposta', () => {
      const [line] = logWith((logger) =>
        logger.info({ res: { headers: { 'set-cookie': ['s=abc'] } } }),
      );
      expect(line.res.headers['set-cookie']).toBe(REDACTED);
    });

    it('remove CPF e segredos de objetos logados manualmente', () => {
      const [line] = logWith((logger) =>
        logger.info(
          {
            cpf: '52998224725',
            user: { id: 'u1', cpf: '52998224725', cpfHash: 'h' },
            secret: 's',
            token: 't',
          },
          'registro',
        ),
      );

      expect(line).toMatchObject({
        cpf: REDACTED,
        user: { id: 'u1', cpf: REDACTED, cpfHash: REDACTED },
        secret: REDACTED,
        token: REDACTED,
      });
      expect(JSON.stringify(line)).not.toContain('52998224725');
    });
  });

  it('tira a query string da url (code/state do callback OAuth)', () => {
    const [line] = logWith((logger) =>
      logger.info({
        req: {
          id: 1,
          method: 'GET',
          url: '/api/auth/callback/google?code=abc&state=xyz',
          headers: {},
        },
      }),
    );
    expect(line.req.url).toBe('/api/auth/callback/google');
  });

  it.each([
    [200, 'info'],
    [302, 'info'],
    [404, 'warn'],
    [409, 'warn'],
    [500, 'error'],
  ])('status %i é logado como %s', (status, level) => {
    const { customLogLevel } = buildPinoHttpOptions({
      level: 'info',
      pretty: false,
    });
    expect(customLogLevel?.(request, response(status))).toBe(level);
  });

  it('erro na requisição é logado como error mesmo com status < 500', () => {
    const { customLogLevel } = buildPinoHttpOptions({
      level: 'info',
      pretty: false,
    });
    expect(customLogLevel?.(request, response(200), new Error('x'))).toBe(
      'error',
    );
  });

  it('usa pino-pretty só quando pretty=true', () => {
    expect(
      buildPinoHttpOptions({ level: 'info', pretty: true }).transport,
    ).toMatchObject({ target: 'pino-pretty' });
    expect(
      buildPinoHttpOptions({ level: 'info', pretty: false }).transport,
    ).toBeUndefined();
  });
});

describe('loggingSettings', () => {
  it('produção: JSON e nível info', () => {
    expect(loggingSettings('production')).toEqual({
      level: 'info',
      pretty: false,
    });
  });

  it('dev (padrão): pino-pretty e nível info', () => {
    expect(loggingSettings()).toEqual({ level: 'info', pretty: true });
  });

  it('testes: silencioso por padrão', () => {
    expect(loggingSettings('test').level).toBe('silent');
  });

  it('LOG_LEVEL tem precedência', () => {
    expect(loggingSettings('production', 'debug').level).toBe('debug');
  });
});

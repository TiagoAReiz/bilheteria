import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from './../src/modules/prisma/prisma.service.js';

// E2E sem banco: sobe o AppModule real (rotas, guard global do Better Auth, pipes)
// trocando apenas o PrismaService por um fake em memoria. Nenhuma conexao e aberta.
// O Elasticsearch aponta para uma porta fechada: a API precisa subir assim mesmo e
// as rotas de busca respondem 503.
// As variaveis abaixo sao fixas para o teste nao depender do .env local.
const TEST_ENV: Record<string, string> = {
  DATABASE_URL: 'postgresql://e2e:e2e@127.0.0.1:1/e2e',
  BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-123',
  BETTER_AUTH_URL: 'http://localhost:3000',
  FRONTEND_URL: 'http://localhost:3001',
  CPF_HASH_SECRET: 'e2e-cpf-secret',
  GOOGLE_CLIENT_ID: 'e2e-google-id',
  GOOGLE_CLIENT_SECRET: 'e2e-google-secret',
  FACEBOOK_CLIENT_ID: 'e2e-facebook-id',
  FACEBOOK_CLIENT_SECRET: 'e2e-facebook-secret',
  ELASTICSEARCH_URL: 'http://127.0.0.1:1',
  ELASTICSEARCH_REQUEST_TIMEOUT_MS: '500',
  // o job de disponibilidade nao roda no e2e (o fake do Prisma nao tem $executeRaw)
  AVAILABILITY_REFRESH_INTERVAL_MS: '0',
  // Mercado Pago: segredo fixo para assinar as notificações do teste e a API numa porta
  // fechada (nenhuma chamada sai para a internet; o provedor "fora do ar" vira 503)
  MP_ACCESS_TOKEN: 'e2e-token',
  MP_WEBHOOK_SECRET: 'e2e-webhook-secret',
  MP_API_BASE_URL: 'http://127.0.0.1:1',
  MP_HTTP_TIMEOUT_MS: '1000',
};

// assina como o Mercado Pago: HMAC-SHA256 de id:<data.id>;request-id:<x-request-id>;ts:<ts>;
const mercadoPagoHeaders = (dataId: string, requestId = 'e2e-request-1') => {
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = createHmac('sha256', TEST_ENV.MP_WEBHOOK_SECRET)
    .update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`)
    .digest('hex');
  return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId };
};

const upcoming = {
  id: 1,
  name: 'Show',
  description: null,
  location: 'Arena',
  starts_at: new Date('2099-01-01T20:00:00.000Z'),
  capacity: 10,
  price_cents: 5000,
  available_tickets: 10,
  organizer_id: 'org-1',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
  deleted_at: null,
};

const createPrismaFake = () => ({
  $connect: vi.fn(),
  $disconnect: vi.fn(),
  $transaction: vi.fn(),
  event: {
    findMany: vi.fn().mockResolvedValue([upcoming]),
    findFirst: vi.fn(async ({ where }: { where: { id: number } }) =>
      where.id === upcoming.id ? upcoming : null,
    ),
    create: vi.fn(),
  },
  ticket: {
    count: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      'is_paid' in where ? 7 : 10,
    ),
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  user: { findUnique: vi.fn(), updateMany: vi.fn() },
  session: { findFirst: vi.fn().mockResolvedValue(null) },
});

describe('Bilheteria (e2e, sem banco)', () => {
  let app: INestApplication<App>;
  let prisma: ReturnType<typeof createPrismaFake>;
  const previousEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const [key, value] of Object.entries(TEST_ENV)) {
      previousEnv[key] = process.env[key];
      process.env[key] = value;
    }

    // importado depois das variaveis de ambiente
    const { AppModule } = await import('./../src/app.module.js');
    prisma = createPrismaFake();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    // mesma configuracao do main.ts
    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('rotas públicas', () => {
    it('GET /events lista os próximos eventos', async () => {
      const res = await request(app.getHttpServer()).get('/events').expect(200);

      expect(res.body).toEqual([
        expect.objectContaining({
          id: 1,
          name: 'Show',
          starts_at: '2099-01-01T20:00:00.000Z',
        }),
      ]);
      expect(prisma.event.findMany).toHaveBeenCalled();
    });

    it('GET /events/:id retorna o evento', async () => {
      const res = await request(app.getHttpServer())
        .get('/events/1')
        .expect(200);
      expect(res.body).toMatchObject({ id: 1, name: 'Show' });
    });

    it('GET /events/:id retorna 404 quando não existe', async () => {
      await request(app.getHttpServer()).get('/events/999').expect(404);
    });

    it('GET /events/:id retorna 400 para id não numérico', async () => {
      await request(app.getHttpServer()).get('/events/abc').expect(400);
    });

    it('GET /status/:id calcula total/available/reserved', async () => {
      const res = await request(app.getHttpServer())
        .get('/status/1')
        .expect(200);
      expect(res.body).toEqual({ total: 10, available: 7, reserved: 3 });
    });

    it('o webhook antigo POST /webhook/ticket/payment não existe mais (404)', async () => {
      await request(app.getHttpServer())
        .post('/webhook/ticket/payment')
        .send({ id: 123, user_id: 'user-1' })
        .expect(404);
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });
  });

  describe('webhook do Mercado Pago', () => {
    const url = '/webhooks/mercadopago?data.id=ORDTST01&type=order';
    const body = { action: 'order.processed', type: 'order', data: { id: 'ORDTST01' } };

    it('sem assinatura: 401 sem tocar no banco', async () => {
      await request(app.getHttpServer()).post(url).send(body).expect(401);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('assinatura com segredo errado: 401', async () => {
      const headers = mercadoPagoHeaders('ORDTST01');
      headers['x-signature'] = headers['x-signature'].replace(/v1=[0-9a-f]+/, `v1=${'0'.repeat(64)}`);
      await request(app.getHttpServer()).post(url).set(headers).send(body).expect(401);
    });

    it('assinatura de outra order (data.id trocado na URL): 401', async () => {
      await request(app.getHttpServer())
        .post(url)
        .set(mercadoPagoHeaders('ORDTST99'))
        .send(body)
        .expect(401);
    });

    it('assinada, mas o Mercado Pago está fora do ar: 503 (o provedor reenvia depois)', async () => {
      await request(app.getHttpServer())
        .post(url)
        .set(mercadoPagoHeaders('ORDTST01'))
        .send(body)
        .expect(503);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('assinada, de outro tópico: 200 sem consultar nada', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/mercadopago?data.id=123&type=payment')
        .set(mercadoPagoHeaders('123'))
        .send({})
        .expect(200, { received: true });
    });
  });

  describe('busca (Elasticsearch fora do ar)', () => {
    it('GET /events/search responde 503 com mensagem clara (e não cai em /events/:id)', async () => {
      const res = await request(app.getHttpServer())
        .get('/events/search')
        .query({ q: 'rock', available: 'true' })
        .expect(503);
      expect(res.body.message).toBe(
        'A busca está temporariamente indisponível. Tente novamente em instantes.',
      );
    });

    it('GET /events/suggest responde 503', async () => {
      await request(app.getHttpServer())
        .get('/events/suggest')
        .query({ q: 'fes' })
        .expect(503);
    });

    it('valida a query antes de ir ao Elasticsearch (400)', async () => {
      const res = await request(app.getHttpServer())
        .get('/events/search')
        .query({ size: '999', available: 'talvez' })
        .expect(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('size'),
          expect.stringContaining('available'),
        ]),
      );
    });

    it('GET /events/suggest sem q é 400', async () => {
      await request(app.getHttpServer()).get('/events/suggest').expect(400);
    });

    it('o resto da API continua funcionando (lê do Postgres)', async () => {
      await request(app.getHttpServer()).get('/events').expect(200);
      await request(app.getHttpServer()).get('/status/1').expect(200);
    });
  });

  describe('rotas protegidas sem sessão', () => {
    it.each([
      ['get', '/users/me'],
      ['patch', '/users/me/cpf'],
      ['patch', '/users/me/organizer'],
      ['post', '/reservation'],
      ['post', '/events'],
      ['get', '/tickets/search'],
      ['post', '/payments/checkout'],
      ['get', '/payments/0b7c2f9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f'],
    ] as const)('%s %s retorna 401', async (method, path) => {
      await request(app.getHttpServer())[method](path).send({}).expect(401);
    });
  });
});

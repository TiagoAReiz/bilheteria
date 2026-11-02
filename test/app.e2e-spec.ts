import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from './../src/modules/prisma/prisma.service.js';

// E2E sem banco: sobe o AppModule real (rotas, guard global do Better Auth, pipes)
// trocando apenas o PrismaService por um fake em memoria. Nenhuma conexao e aberta.
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
};

const upcoming = {
  id: 1,
  name: 'Show',
  description: null,
  location: 'Arena',
  starts_at: new Date('2099-01-01T20:00:00.000Z'),
  capacity: 10,
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

    it('POST /webhook/ticket/payment valida o body (400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/webhook/ticket/payment')
        .send({ id: 'x' })
        .expect(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('id'),
          expect.stringContaining('user_id'),
        ]),
      );
    });

    it('POST /webhook/ticket/payment retorna 404 para ticket inexistente', async () => {
      await request(app.getHttpServer())
        .post('/webhook/ticket/payment')
        .send({ id: 123, user_id: 'user-1' })
        .expect(404);
    });
  });

  describe('rotas protegidas sem sessão', () => {
    it.each([
      ['get', '/users/me'],
      ['patch', '/users/me/cpf'],
      ['patch', '/users/me/organizer'],
      ['post', '/reservation'],
      ['post', '/events'],
    ] as const)('%s %s retorna 401', async (method, path) => {
      await request(app.getHttpServer())[method](path).send({}).expect(401);
    });
  });
});

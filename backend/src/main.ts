import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // o better auth precisa do body cru nas rotas /api/auth; o AuthModule re-adiciona os parsers nas demais
    bodyParser: false,
    // segura os logs do boot ate o pino assumir, para tudo sair no mesmo formato
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  // o front manda o cookie de sessao do better auth em todas as rotas, nao so em /api/auth
  app.enableCors({ origin: process.env.FRONTEND_URL, credentials: true });
  // process.exit no fim do shutdown deixa o pino descarregar o buffer do transport antes de sair
  app.enableShutdownHooks(undefined, { useProcessExit: true });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

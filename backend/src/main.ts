import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // o better auth precisa do body cru nas rotas /api/auth; o AuthModule re-adiciona os parsers nas demais
    bodyParser: false,
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  // o front manda o cookie de sessao do better auth em todas as rotas, nao so em /api/auth
  app.enableCors({ origin: process.env.FRONTEND_URL, credentials: true });
  app.enableShutdownHooks()
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();

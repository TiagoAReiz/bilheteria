import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { FavoriteController } from './adapters/inbound/controllers/favorite.controller.js';
import { FavoriteRepository } from './adapters/outbound/repositories/favorite.repository.js';
import { FavoriteService } from './application/services/favorite.service.js';
import { FAVORITE_SERVICE } from './application/ports/inbound/services/favorite.service.port.js';
import { FAVORITE_REPOSITORY } from './application/ports/outbound/repositories/favorite.repository.port.js';

/** Favoritos (wishlist). O email de abertura das vendas lê a tabela direto no módulo notification. */
@Module({
  controllers: [FavoriteController],
  providers: [
    { provide: FAVORITE_SERVICE, useClass: FavoriteService },
    { provide: FAVORITE_REPOSITORY, useClass: FavoriteRepository },
  ],
  imports: [PrismaModule, StorageModule],
})
export class FavoriteModule {}

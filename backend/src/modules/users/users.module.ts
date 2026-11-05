import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { UserController } from './adapters/inbound/controllers/user.controller.js';
import { createAuth } from './adapters/outbound/auth/better-auth.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserService } from './application/services/user.service.js';
import { UserRepository } from './adapters/outbound/repositories/user.repository.js';
import { CpfHasher } from './adapters/outbound/crypto/cpf-hasher.js';
import { USER_SERVICE } from './application/ports/inbound/services/user.service.port.js';
import { USER_REPOSITORY } from './application/ports/outbound/repositories/user.repository.port.js';
import { CPF_HASHER } from './application/ports/outbound/crypto/cpf-hasher.port.js';
import { StorageModule } from '../storage/storage.module.js';
import {
  IMAGE_STORAGE_SERVICE,
  type ImageStorageServicePort,
} from '../storage/application/ports/inbound/services/image-storage.service.port.js';

@Module({
  controllers: [UserController],
  providers: [
    { provide: USER_SERVICE, useClass: UserService },
    { provide: USER_REPOSITORY, useClass: UserRepository },
    { provide: CPF_HASHER, useClass: CpfHasher },
  ],
  exports: [USER_SERVICE],
  imports: [
    PrismaModule,
    StorageModule,
    AuthModule.forRootAsync({
      imports: [PrismaModule, StorageModule],
      inject: [PrismaService, ConfigService, IMAGE_STORAGE_SERVICE],
      useFactory: (
        prisma: PrismaService,
        config: ConfigService,
        images: ImageStorageServicePort,
      ) => ({
        auth: createAuth(prisma, config, (key) => images.publicUrl(key)),
      }),
    }),
  ],
})
export class UsersModule {}

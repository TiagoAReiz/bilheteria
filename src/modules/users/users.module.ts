import { Module } from '@nestjs/common';
import {ConfigService} from "@nestjs/config";
import {AuthModule} from "@thallesp/nestjs-better-auth";
import {UserController} from "./adapters/inbound/controllers/user.controller.js";
import {createAuth} from "./adapters/outbound/auth/better-auth.js";
import {PrismaModule} from "../prisma/prisma.module.js";
import {PrismaService} from "../prisma/prisma.service.js";

@Module({
  controllers: [UserController],
  imports: [
      AuthModule.forRootAsync({
          imports: [PrismaModule],
          inject: [PrismaService, ConfigService],
          useFactory: (prisma: PrismaService, config: ConfigService) => ({
              auth: createAuth(prisma, config),
          }),
      }),
  ],
})
export class UsersModule {}

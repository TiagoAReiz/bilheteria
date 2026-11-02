import { Module } from '@nestjs/common';
import {ConfigModule} from "@nestjs/config";
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
      ConfigModule.forRoot({isGlobal: true}),
      PrismaModule,
      UsersModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

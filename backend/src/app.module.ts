import { Module } from '@nestjs/common';
import { TicketModule } from './modules/ticket/ticket.module.js';
import {ConfigModule} from "@nestjs/config";
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { EventModule } from './modules/event/event.module.js';
import { ObservabilityModule } from './modules/observability/observability.module.js';

@Module({
  imports: [
      ConfigModule.forRoot({isGlobal: true}),
      ObservabilityModule,
      ScheduleModule.forRoot(),
      TicketModule,
      PrismaModule,
      UsersModule,
      EventModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

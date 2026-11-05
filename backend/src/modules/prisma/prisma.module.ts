import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Module({
  controllers: [],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

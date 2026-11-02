import {Injectable, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {PrismaClient} from "../../generated/prisma/client.js";
import {ConfigService} from "@nestjs/config";
import {PrismaPg} from "@prisma/adapter-pg";
import pg from "pg";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    constructor(configService: ConfigService) {
        const pool = new pg.Pool({
            connectionString: configService.getOrThrow<string>('DATABASE_URL')
        });

        const adapter = new PrismaPg(pool);
        super({ adapter });
    }

    async onModuleInit () {
        await this.$connect();
    }
    async onModuleDestroy() {
        await this.$disconnect();
    }

}

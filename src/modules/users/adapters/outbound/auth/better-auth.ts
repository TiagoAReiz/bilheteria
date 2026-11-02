import {betterAuth} from "better-auth";
import {prismaAdapter} from "better-auth/adapters/prisma";
import {ConfigService} from "@nestjs/config";
import {PrismaService} from "../../../../prisma/prisma.service.js";
import {Role} from "../../../core/entities/role.js";

export function createAuth(prisma: PrismaService, config: ConfigService) {
    return betterAuth({
        database: prismaAdapter(prisma, {provider: "postgresql"}),
        secret: config.getOrThrow<string>('BETTER_AUTH_SECRET'),
        baseURL: config.getOrThrow<string>('BETTER_AUTH_URL'),
        trustedOrigins: [config.getOrThrow<string>('FRONTEND_URL')],
        socialProviders: {
            google: {
                clientId: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
                clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
            },
            facebook: {
                clientId: config.getOrThrow<string>('FACEBOOK_CLIENT_ID'),
                clientSecret: config.getOrThrow<string>('FACEBOOK_CLIENT_SECRET'),
            },
        },
        account: {
            accountLinking: {enabled: true, trustedProviders: ["google", "facebook"]},
        },
        user: {
            additionalFields: {
                role: {type: "string", defaultValue: Role.USER, input: false},
                cpfHash: {type: "string", required: false, input: false, returned: false},
            },
        },
    });
}

export type Auth = ReturnType<typeof createAuth>;

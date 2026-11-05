import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { customSession } from 'better-auth/plugins';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { Role } from '../../../core/entities/role.js';
import { resolveAvatarUrl } from '../../../core/entities/avatar.js';

/** Monta a URL pública de uma chave do bucket (vem do módulo storage). */
export type PublicUrlResolver = (key: string) => string;

export function createAuth(
  prisma: PrismaService,
  config: ConfigService,
  publicUrl: PublicUrlResolver,
) {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
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
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'facebook'],
      },
    },
    user: {
      additionalFields: {
        role: { type: 'string', defaultValue: Role.USER, input: false },
        cpfHash: {
          type: 'string',
          required: false,
          input: false,
          returned: false,
        },
        // só muda pelo PUT/DELETE /users/me/avatar (que confere o objeto no bucket)
        avatarKey: { type: 'string', required: false, input: false },
      },
    },
    plugins: [
      // a sessão (GET /api/auth/get-session e o @Session() da API) leva a URL do avatar já
      // resolvida: o enviado pelo usuário ou, sem ele, a foto do Google/Facebook (`image`)
      customSession(async ({ user, session }) => ({
        session,
        user: { ...user, avatarUrl: resolveAvatarUrl(user, publicUrl) },
      })),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

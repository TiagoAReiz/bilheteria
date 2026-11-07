# API NestJS. Três estágios:
#   build    dependências completas + prisma generate + nest build (também roda as migrations)
#   deps     só dependências de produção
#   runtime  imagem final: node_modules de produção + dist, usuário sem root
# Usado pelo docker-compose.yaml da raiz (serviços migrate e api).

FROM node:24.20.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# o client do Prisma é gerado em src/generated/prisma e compilado junto para dist/
RUN npx prisma generate --config prisma7.config.ts && npm run build
# serviço migrate do compose: aplica as migrations pendentes e sai
CMD ["npx", "prisma", "migrate", "deploy", "--config", "prisma7.config.ts"]

FROM node:24.20.0-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24.20.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
# mesmo comando do start:prod; as variáveis vêm do compose (env_file + environment)
CMD ["node", "--import", "./dist/instrumentation.js", "dist/main"]

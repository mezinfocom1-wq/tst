# Image de l'API. Contexte de construction : la racine du dépôt.
#   docker build -f apps/api/Dockerfile -t salon-api .
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @salon/api...
COPY apps/api apps/api
RUN pnpm --filter @salon/api build
# Dossier autonome contenant uniquement les dépendances de production de l'API.
RUN pnpm --filter @salon/api deploy --prod --legacy /out && cp -r apps/api/dist apps/api/prisma /out/ \
  && cd /out && npx prisma generate

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
RUN mkdir -p uploads && chown -R node:node /app
USER node
EXPOSE 4000
# Les migrations sont appliquées au démarrage, puis l'API est lancée.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]

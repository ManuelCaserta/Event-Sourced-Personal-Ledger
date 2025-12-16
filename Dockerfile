FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vitest.config.ts vitest.integration.config.ts ./
COPY src ./src

RUN npm run build

# Copy static assets into dist (tsc does not copy non-TS files)
RUN mkdir -p dist/infra/web && cp -R src/infra/web/public dist/infra/web/public

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

# Runtime needs SQL migrations and route TS files:
# - migrations are read from process.cwd()/src/infra/db/migrations
# - swagger-jsdoc reads from ./src/infra/http/routes/*.ts
COPY --from=build /app/src/infra/db/migrations ./src/infra/db/migrations
COPY --from=build /app/src/infra/http/routes ./src/infra/http/routes

EXPOSE 3000
CMD ["npm", "run", "start"]



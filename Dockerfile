# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
ENV HUSKY=0
COPY package.json package-lock.json ./
COPY web/package.json ./web/package.json
RUN npm ci
COPY tsconfig.json vitest.config.ts biome.json ./
COPY src ./src
COPY web ./web
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production HUSKY=0
COPY package.json package-lock.json ./
COPY web/package.json ./web/package.json
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
COPY README.md LICENSE ./

EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4321/api/health || exit 1

CMD ["node", "dist/cli/index.js", "dashboard", "--no-open", "--port", "4321"]

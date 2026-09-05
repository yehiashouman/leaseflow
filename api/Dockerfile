FROM node:22.19.0-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY api/package.json ./api/package.json
COPY web/package.json ./web/package.json
RUN npm ci

FROM deps AS build
COPY api ./api
RUN npm run prisma:generate -w api && npm run build -w api

FROM node:22.19.0-alpine AS runtime
ENV NODE_ENV=production
RUN addgroup -S leaseflow && adduser -S leaseflow -G leaseflow
WORKDIR /app
COPY package*.json ./
COPY api/package.json ./api/package.json
COPY web/package.json ./web/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/api/dist ./api/dist
COPY --from=build /app/api/prisma ./api/prisma
USER leaseflow
EXPOSE 3000
CMD ["node", "api/dist/src/server.js"]

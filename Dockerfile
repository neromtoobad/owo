FROM node:24-slim
WORKDIR /app
COPY web/package.json web/package-lock.json* web/
RUN cd web && npm ci --no-audit --no-fund
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund
COPY web web
RUN cd web && npm run build
COPY server server
COPY deployments deployments
ENV NODE_ENV=production DATA_DIR=/data
WORKDIR /app/server
CMD ["node", "src/main.ts"]

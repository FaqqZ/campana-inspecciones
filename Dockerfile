# Campaña de inspecciones: cliente compilado + API en una sola imagen.
FROM node:22-alpine AS cliente
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production SERVE_CLIENT=true
WORKDIR /app
COPY server/package*.json server/
RUN cd server && npm ci --omit=dev
COPY server/ server/
COPY --from=cliente /app/client/dist client/dist
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p server/uploads && chown -R node:node server/uploads
USER node
WORKDIR /app/server
EXPOSE 5003
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD wget -qO- http://127.0.0.1:${PORT:-5003}/api/health || exit 1
ENTRYPOINT ["/entrypoint.sh"]

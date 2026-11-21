FROM node:24.9.0-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
COPY next.config.ts next-env.d.ts tsconfig.json postcss.config.mjs ./
COPY src ./src
COPY public ./public
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

FROM node:24.9.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NODE_OPTIONS=--max-old-space-size=1024 \
    MARKET_RADAR_DATA_DIR=/app/data \
    MARKET_RADAR_SESSION_DB=/app/runtime/conversations.sqlite
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p /app/data /app/runtime && chown node:node /app/data /app/runtime
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz',{signal:AbortSignal.timeout(4000)}).then(async r=>{const h=await r.json();process.exit(r.ok&&h.status==='ok'?0:1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

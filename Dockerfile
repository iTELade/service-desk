FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
WORKDIR /app
LABEL org.opencontainers.image.licenses="AGPL-3.0-only"
COPY LICENSE README.md ./
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node server.mjs ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
RUN mkdir -p /app/data /app/control && chown node:node /app/data /app/control && chmod 700 /app/data /app/control
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "import('./lib/version.mjs').then(async v=>{const r=await fetch('http://127.0.0.1:3000/healthz',{signal:AbortSignal.timeout(3000)});const h=await r.json();process.exit(r.ok&&h.status==='ok'&&h.version===v.VERSION&&h.schema===v.SCHEMA_VERSION?0:1)}).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]

FROM node:24-bookworm-slim
WORKDIR /app
COPY lib/core.mjs lib/secrets.mjs lib/releases.mjs ./lib/
COPY updater/*.mjs ./updater/
ENV DATA_DIR=/app/data CONTROL_DIR=/app/control BACKUP_DIR=/app/backups
CMD ["node","updater/agent.mjs"]

# Handova API server: WhatsApp bot, identity verification, media, reviews/repairs/boosts/referrals/moderation.
# Deploy on Railway / Render / Fly with a persistent volume mounted at /app/server/data (SQLite + uploads).
FROM oven/bun:1.3 AS base
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

COPY server ./server
COPY tsconfig.json ./

ENV NODE_ENV=production \
    RENTFLOW_DB=/app/server/data/rentflow.db \
    MEDIA_DIR=/app/server/data/uploads
VOLUME ["/app/server/data"]
EXPOSE 3001
CMD ["bun", "run", "server/whatsapp-bot.ts"]

FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/src/server/db/generated ./src/server/db/generated
COPY . .
RUN npm run build

FROM builder AS media-worker
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
USER nextjs
CMD ["node", "--conditions=react-server", "--import", "tsx", "scripts/media-maintenance.ts"]

FROM media-worker AS auth-mail-worker
CMD ["node", "--conditions=react-server", "--import", "tsx", "scripts/auth-mail.ts"]

FROM media-worker AS reminder-worker
CMD ["node", "--conditions=react-server", "--import", "tsx", "scripts/reminders.ts"]

FROM media-worker AS privacy-worker
CMD ["node", "--conditions=react-server", "--import", "tsx", "scripts/privacy-maintenance.ts"]

FROM media-worker AS backup-worker
USER root
RUN apk add --no-cache postgresql17-client
USER nextjs
CMD ["node", "--conditions=react-server", "--import", "tsx", "scripts/backup.ts"]

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

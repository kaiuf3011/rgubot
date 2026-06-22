FROM node:20-alpine

WORKDIR /app

# Configure non-root user
RUN chown -R node:node /app
USER node

# Install only production dependencies
COPY --chown=node:node package*.json ./
RUN npm install --omit=dev --legacy-peer-deps

# Copy source code
COPY --chown=node:node . .

ENV NODE_ENV=production
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "server.js"]

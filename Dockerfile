# ==========================================
# Stage 1: build the React frontend
# ==========================================
FROM node:18-alpine AS web-build

WORKDIR /usr/src/web

COPY web/package*.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

# ==========================================
# Stage 2: operator server
# ==========================================
FROM node:18-alpine

WORKDIR /usr/src/app

# Install production dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --only=production

# App source
COPY server.js ./
COPY src/ ./src/
COPY payment-providers/ ./payment-providers/
COPY middleware/ ./middleware/
COPY navigation/ ./navigation/
COPY public/ ./public/

# Built frontend from stage 1
COPY --from=web-build /usr/src/web/dist ./web/dist

# Expose API and WebSocket ports
EXPOSE 3000 3001

# Run as non-root user
USER node

CMD ["node", "server.js"]

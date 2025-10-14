FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app source
COPY server.js .
COPY strike-stake-implementation.js .

# Expose ports
EXPOSE 3000 3001

# Run as non-root user
USER node

# Start server
CMD ["node", "server.js"]
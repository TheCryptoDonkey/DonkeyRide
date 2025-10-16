FROM node:18-alpine

WORKDIR /app

# Install dependencies
RUN npm install express cors

# Copy mock server
COPY server.js .

# Expose ports
EXPOSE 8080 9735

# Start mock Lightning node
CMD ["node", "server.js"]

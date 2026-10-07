FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Expose standard port
EXPOSE 3030

# Start server
CMD ["node", "server.js"]

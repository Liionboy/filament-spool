FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Create DB directory
RUN mkdir -p /app/db

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV DB_PATH=/app/db/filaments.sqlite

# Start application
CMD ["node", "server/index.js"]

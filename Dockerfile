# Multi-stage build for optimal production deployment
FROM node:20-alpine AS dependencies

# Install system dependencies for crypto operations
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:20-alpine AS production

# Install tini for proper signal handling
RUN apk add --no-cache tini

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

WORKDIR /usr/src/app

# Copy production dependencies
COPY --from=dependencies --chown=nodejs:nodejs /usr/src/app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs . .

# Create temp directory with proper permissions
RUN mkdir -p /tmp/media-decrypt && \
    chown -R nodejs:nodejs /tmp/media-decrypt

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV TEMP_DIR=/tmp/media-decrypt

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Expose port
EXPOSE 3000

# Switch to non-root user
USER nodejs

# Use tini as init system
ENTRYPOINT ["/sbin/tini", "--"]

# Start application
CMD ["node", "src/index.js"]

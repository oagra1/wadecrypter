const fastify = require('fastify')({
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  },
  bodyLimit: 104857600, // 100MB
  pluginTimeout: 60000
});

const path = require('path');
const crypto = require('crypto');

// Security middleware
fastify.register(require('@fastify/helmet'), {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  }
});

fastify.register(require('@fastify/cors'), {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5678'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
});

// Rate limiting
fastify.register(require('@fastify/rate-limit'), {
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  timeWindow: '15 minutes'
});

// Multipart support for file uploads
fastify.register(require('@fastify/multipart'), {
  limits: {
    fieldNameSize: 100,
    fieldSize: 100,
    fields: 10,
    fileSize: 104857600, // 100MB
    files: 1,
    headerPairs: 2000
  }
});

// Import services and routes
const mediaRoutes = require('./routes/media');
const FileManager = require('./services/FileManager');
const logger = require('./utils/logger');

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  const memoryUsage = process.memoryUsage();
  
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: {
      used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
      unit: 'MB'
    },
    version: process.env.npm_package_version || '1.0.0'
  };
});

// API Key Authentication
fastify.register(async function (fastify) {
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip auth for health check
    if (request.url === '/health') return;
    
    const apiKey = request.headers['x-api-key'] || request.headers['authorization']?.replace('Bearer ', '');
    
    if (!apiKey) {
      return reply.status(401).send({ 
        error: 'API key required',
        message: 'Include X-API-Key header or Bearer token'
      });
    }
    
    const validApiKey = process.env.API_KEY || 'your-secure-api-key';
    
    if (apiKey !== validApiKey) {
      return reply.status(403).send({ 
        error: 'Invalid API key',
        message: 'Provided API key is not valid'
      });
    }
  });
});

// Register media routes
fastify.register(mediaRoutes, { prefix: '/api/v1' });

// Global error handler
fastify.setErrorHandler(async (error, request, reply) => {
  fastify.log.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    url: request.url,
    method: request.method,
    requestId: request.id
  });

  return reply.status(500).send({
    error: 'Internal server error',
    requestId: request.id,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  fastify.log.info(`Received ${signal}, starting graceful shutdown`);
  
  try {
    await FileManager.cleanup();
    await fastify.close();
    fastify.log.info('Server closed gracefully');
    process.exit(0);
  } catch (error) {
    fastify.log.error('Error during shutdown', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const start = async () => {
  try {
    await FileManager.ensureDirectories();
    
    const host = process.env.HOST || '0.0.0.0';
    const port = parseInt(process.env.PORT) || 3000;
    
    await fastify.listen({ host, port });
    fastify.log.info(`Server listening on ${host}:${port}`);
    
  } catch (error) {
    fastify.log.error('Failed to start server', error);
    process.exit(1);
  }
};

start();

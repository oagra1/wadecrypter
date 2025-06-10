const fastify = require('fastify')({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    }
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
const MediaDecryption = require('./services/MediaDecryption');
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

// Media decryption endpoint
fastify.post('/api/v1/decrypt', {
  schema: {
    body: {
      type: 'object',
      required: ['mediaUrl', 'mediaKey', 'mediaType'],
      properties: {
        mediaUrl: { 
          type: 'string', 
          format: 'uri',
          pattern: '^https?://'
        },
        mediaKey: { 
          type: 'string',
          minLength: 32,
          maxLength: 100
        },
        mediaType: { 
          type: 'string', 
          enum: ['image', 'video', 'audio', 'document']
        },
        iv: { 
          type: 'string',
          minLength: 16
        }
      }
    }
  }
}, async (request, reply) => {
  const startTime = Date.now();
  const { mediaUrl, mediaKey, mediaType, iv } = request.body;
  
  try {
    logger.info('Starting media decryption', {
      mediaType,
      mediaUrl: mediaUrl.substring(0, 50) + '...',
      requestId: request.id
    });

    // Validate and expand media key using HKDF
    const expandedKey = MediaDecryption.expandMediaKey(mediaKey, mediaType);
    
    // Download and decrypt media
    const decryptedStream = await MediaDecryption.decryptMedia(
      mediaUrl, 
      expandedKey,
      mediaType
    );

    // Set appropriate headers
    const contentType = MediaDecryption.getContentType(mediaType);
    const filename = `decrypted_${Date.now()}.${MediaDecryption.getFileExtension(mediaType)}`;
    
    reply.header('Content-Type', contentType);
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    reply.header('X-Content-Type-Options', 'nosniff');
    
    const processingTime = Date.now() - startTime;
    logger.info('Media decryption completed', {
      mediaType,
      processingTime,
      requestId: request.id
    });

    return reply.send(decryptedStream);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Media decryption failed', {
      error: error.message,
      mediaType,
      processingTime,
      requestId: request.id
    });

    if (error.name === 'ValidationError') {
      return reply.status(400).send({
        error: 'Invalid input parameters',
        message: error.message,
        requestId: request.id
      });
    }

    if (error.name === 'DecryptionError') {
      return reply.status(422).send({
        error: 'Decryption failed',
        message: 'Invalid media key or corrupted file',
        requestId: request.id
      });
    }

    if (error.name === 'NetworkError') {
      return reply.status(502).send({
        error: 'Network error',
        message: 'Failed to download media file',
        requestId: request.id
      });
    }

    return reply.status(500).send({
      error: 'Internal server error',
      message: 'Media processing failed',
      requestId: request.id
    });
  }
});

// Global error handler
fastify.setErrorHandler(async (error, request, reply) => {
  logger.error('Unhandled error', {
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
  logger.info(`Received ${signal}, starting graceful shutdown`);
  
  try {
    await FileManager.cleanup();
    await fastify.close();
    logger.info('Server closed gracefully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error);
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
    logger.info(`Server listening on ${host}:${port}`);
    
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
};

start();

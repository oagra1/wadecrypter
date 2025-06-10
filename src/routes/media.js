const MediaDecryption = require('../services/MediaDecryption');
const { ValidationError, DecryptionError, NetworkError } = require('../utils/errors');
const logger = require('../utils/logger');
const fetch = require('node-fetch');

async function mediaRoutes(fastify, options) {
  
  // Decrypt media endpoint
  fastify.post('/decrypt', {
    schema: {
      body: {
        type: 'object',
        required: ['mediaUrl', 'mediaKey', 'mediaType'],
        properties: {
          mediaUrl: { 
            type: 'string', 
            format: 'uri',
            pattern: '^https://'
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
          options: {
            type: 'object',
            properties: {
              timeout: { type: 'number', minimum: 5000, maximum: 300000 },
              retries: { type: 'number', minimum: 1, maximum: 5 }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const startTime = Date.now();
    const { mediaUrl, mediaKey, mediaType, options = {} } = request.body;
    
    try {
      logger.info('Starting media decryption', {
        mediaType,
        mediaUrl: mediaUrl.substring(0, 50) + '...',
        requestId: request.id
      });

      // Validate and expand media key
      const expandedKey = MediaDecryption.expandMediaKey(mediaKey, mediaType);
      
      // Download encrypted media
      const response = await fetch(mediaUrl, {
        timeout: options.timeout || 60000,
        headers: {
          'User-Agent': 'WhatsApp/2.23.20 (iPhone; iOS 16.6; Scale/3.00)',
          'Accept': '*/*',
          'Accept-Encoding': 'identity',
          'Connection': 'keep-alive'
        }
      });

      if (!response.ok) {
        throw new NetworkError(`HTTP ${response.status}: ${response.statusText}`);
      }

      const encryptedData = Buffer.from(await response.arrayBuffer());
      
      // Decrypt media
      const decryptedData = await MediaDecryption.decryptData(encryptedData, expandedKey);

      // Set appropriate headers
      const contentType = MediaDecryption.getContentType(mediaType);
      const filename = `decrypted_${Date.now()}.${MediaDecryption.getFileExtension(mediaType)}`;
      
      reply.header('Content-Type', contentType);
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      reply.header('Content-Length', decryptedData.length);
      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      reply.header('X-Content-Type-Options', 'nosniff');
      
      const processingTime = Date.now() - startTime;
      logger.info('Media decryption completed', {
        mediaType,
        originalSize: encryptedData.length,
        decryptedSize: decryptedData.length,
        processingTime,
        requestId: request.id
      });

      return reply.send(decryptedData);

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Media decryption failed', {
        error: error.message,
        mediaType,
        processingTime,
        requestId: request.id
      });

      if (error instanceof ValidationError) {
        return reply.status(400).send({
          error: 'Invalid input parameters',
          message: error.message,
          field: error.field,
          requestId: request.id
        });
      }

      if (error instanceof DecryptionError) {
        return reply.status(422).send({
          error: 'Decryption failed',
          message: 'Invalid media key or corrupted file',
          requestId: request.id
        });
      }

      if (error instanceof NetworkError || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
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

  // Health check specific to media processing
  fastify.get('/health', async (request, reply) => {
    const memoryUsage = process.memoryUsage();
    
    return {
      status: 'healthy',
      service: 'media-decryption',
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
}

module.exports = mediaRoutes;

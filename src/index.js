const fastify = require('fastify')({
  logger: true
});

const MediaDownload = require('./services/MediaDownload');
const MediaDecryption = require('./services/MediaDecryption');
const FileManager = require('./services/FileManager');
const { DecryptionError, NetworkError, ValidationError } = require('./utils/errors');

// Health check
fastify.get('/health', async (request, reply) => {
  return { 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  };
});

// Rota de teste
fastify.get('/', async (request, reply) => {
  return { message: 'WhatsApp Decryption Service is running!' };
});

// API Key Authentication
fastify.addHook('preHandler', async (request, reply) => {
  // Skip auth for health check and root
  if (request.url === '/health' || request.url === '/') return;
  
  const apiKey = request.headers['x-api-key'] || request.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey) {
    return reply.status(401).send({ 
      error: 'API key required',
      message: 'Include X-API-Key header'
    });
  }
  
  const validApiKey = process.env.API_KEY || 'jbELWecKq3zFwskJTqr1vqrCNChublny';
  
  if (apiKey !== validApiKey) {
    return reply.status(403).send({ 
      error: 'Invalid API key'
    });
  }
});

// Rota de descriptografia COMPLETA
fastify.post('/api/v1/decrypt', async (request, reply) => {
  const startTime = Date.now();
  
  try {
    const { mediaUrl, mediaKey, mediaType, encryptionType } = request.body;
    
    // Validação obrigatória
    if (!mediaUrl || !mediaKey || !mediaType) {
      return reply.status(400).send({
        error: 'Missing required fields',
        required: ['mediaUrl', 'mediaKey', 'mediaType'],
        received: { mediaUrl: !!mediaUrl, mediaKey: !!mediaKey, mediaType: !!mediaType }
      });
    }

    console.log(`🔄 Starting decryption for ${mediaType} file`);
    console.log(`📍 URL: ${mediaUrl.substring(0, 50)}...`);
    console.log(`🔑 MediaKey length: ${mediaKey.length}`);

    // 1. Download arquivo criptografado
    console.log('📥 Downloading encrypted file...');
    const encryptedData = await MediaDownload.downloadMedia(mediaUrl, {
      timeout: 120000,
      retries: 3
    });
    
    console.log(`✅ Downloaded ${encryptedData.length} bytes`);

    // 2. Validar e expandir chave
    console.log('🔑 Expanding media key...');
    const expandedKey = MediaDecryption.expandMediaKey(mediaKey, mediaType);
    
    // 3. Descriptografar
    console.log('🔓 Decrypting file...');
    const decryptedData = await MediaDecryption.decryptData(encryptedData, expandedKey);
    
    console.log(`✅ Decrypted ${decryptedData.length} bytes`);

    // 4. Preparar resposta
    const contentType = MediaDecryption.getContentType(mediaType);
    const fileExtension = MediaDecryption.getFileExtension(mediaType);
    const filename = `decrypted_${Date.now()}.${fileExtension}`;
    
    // Headers para download
    reply.header('Content-Type', contentType);
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.header('Content-Length', decryptedData.length);
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    reply.header('X-Content-Type-Options', 'nosniff');
    
    const processingTime = Date.now() - startTime;
    console.log(`🎉 Decryption completed in ${processingTime}ms`);
    
    // Cleanup seguro da chave
    MediaDecryption.secureKeyCleanup(expandedKey);
    
    return reply.send(decryptedData);
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ Decryption failed:', error.message);
    
    if (error instanceof ValidationError) {
      return reply.status(400).send({
        error: 'Validation failed',
        message: error.message,
        processingTime
      });
    }
    
    if (error instanceof NetworkError) {
      return reply.status(502).send({
        error: 'Network error',
        message: 'Failed to download media file',
        details: error.message,
        processingTime
      });
    }
    
    if (error instanceof DecryptionError) {
      return reply.status(422).send({
        error: 'Decryption failed',
        message: 'Invalid media key or corrupted file',
        details: error.message,
        processingTime
      });
    }
    
    return reply.status(500).send({
      error: 'Internal server error',
      message: error.message,
      processingTime
    });
  }
});

// Start server
const start = async () => {
  try {
    // Inicializar FileManager
    await FileManager.ensureDirectories();
    
    const host = '0.0.0.0';
    const port = parseInt(process.env.PORT) || 3000;
    
    await fastify.listen({ host, port });
    console.log(`✅ Server listening on ${host}:${port}`);
    console.log(`🔗 API endpoint: http://${host}:${port}/api/v1/decrypt`);
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

start().catch((error) => {
  console.error('❌ Startup error:', error);
  process.exit(1);
});

const fastify = require('fastify')({
  logger: true
});

const crypto = require('crypto');
const fetch = require('node-fetch');

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

// Função de descriptografia
function expandMediaKey(mediaKeyBase64, mediaType) {
  const mediaKey = Buffer.from(mediaKeyBase64, 'base64');
  
  if (mediaKey.length !== 32) {
    throw new Error(`Invalid media key length: ${mediaKey.length}, expected 32 bytes`);
  }

  const applicationInfo = {
    'image': 'WhatsApp Image Keys',
    'video': 'WhatsApp Video Keys', 
    'audio': 'WhatsApp Audio Keys',
    'document': 'WhatsApp Document Keys'
  };

  const info = applicationInfo[mediaType];
  if (!info) {
    throw new Error(`Unsupported media type: ${mediaType}`);
  }

  const salt = Buffer.alloc(32);
  const expandedKey = crypto.hkdfSync('sha256', mediaKey, salt, info, 112);

  return {
    cipherKey: expandedKey.slice(0, 32),
    macKey: expandedKey.slice(32, 64), 
    iv: expandedKey.slice(64, 80)
  };
}

function decryptData(encryptedData, expandedKey) {
  if (encryptedData.length < 10) {
    throw new Error('File too small to be valid encrypted media');
  }

  const fileMac = encryptedData.slice(0, 10);
  const encryptedContent = encryptedData.slice(10);

  const expectedMac = crypto.createHmac('sha256', expandedKey.macKey)
    .update(encryptedContent)
    .digest()
    .slice(0, 10);

  if (!crypto.timingSafeEqual(fileMac, expectedMac)) {
    throw new Error('MAC verification failed - invalid key or corrupted file');
  }

  const decipher = crypto.createDecipheriv('aes-256-cbc', expandedKey.cipherKey, expandedKey.iv);
  
  let decrypted = Buffer.alloc(0);
  decrypted = Buffer.concat([decrypted, decipher.update(encryptedContent)]);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted;
}

// Rota de descriptografia REAL
fastify.post('/api/v1/decrypt', async (request, reply) => {
  try {
    const { mediaUrl, mediaKey, mediaType } = request.body;
    
    if (!mediaUrl || !mediaKey || !mediaType) {
      return reply.status(400).send({
        error: 'Missing required fields: mediaUrl, mediaKey, mediaType'
      });
    }

    // Download arquivo criptografado
    const response = await fetch(mediaUrl, {
      timeout: 60000,
      headers: {
        'User-Agent': 'WhatsApp/2.23.20 (iPhone; iOS 16.6; Scale/3.00)',
        'Accept': '*/*',
        'Connection': 'keep-alive'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const encryptedData = Buffer.from(await response.arrayBuffer());
    
    // Descriptografar
    const expandedKey = expandMediaKey(mediaKey, mediaType);
    const decryptedData = decryptData(encryptedData, expandedKey);

    // Retornar arquivo descriptografado
    const contentType = mediaType === 'document' ? 'application/octet-stream' : 'application/octet-stream';
    const filename = `decrypted_${Date.now()}.${mediaType === 'document' ? 'pdf' : 'bin'}`;
    
    reply.header('Content-Type', contentType);
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);
    reply.header('Content-Length', decryptedData.length);
    
    return reply.send(decryptedData);
    
  } catch (error) {
    console.error('Decryption error:', error);
    return reply.status(500).send({
      error: 'Decryption failed',
      message: error.message
    });
  }
});

// Start server
const start = async () => {
  try {
    const host = '0.0.0.0';
    const port = parseInt(process.env.PORT) || 3000;
    
    await fastify.listen({ host, port });
    console.log(`✅ Server listening on ${host}:${port}`);
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

start().catch((error) => {
  console.error('❌ Startup error:', error);
  process.exit(1);
});

const fastify = require('fastify')({
  logger: true
});

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

// Rota de descriptografia
fastify.post('/api/v1/decrypt', async (request, reply) => {
  try {
    const { mediaUrl, mediaKey, mediaType } = request.body;
    
    // Validação básica
    if (!mediaUrl || !mediaKey || !mediaType) {
      return reply.status(400).send({
        error: 'Missing required fields: mediaUrl, mediaKey, mediaType'
      });
    }
    
    // Por enquanto, só retorna sucesso (para teste)
    return reply.send({
      success: true,
      message: 'Decryption endpoint working!',
      received: { 
        mediaUrl: mediaUrl.substring(0, 50) + '...', 
        mediaType,
        mediaKeyLength: mediaKey.length
      }
    });
    
  } catch (error) {
    return reply.status(500).send({
      error: 'Internal server error',
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

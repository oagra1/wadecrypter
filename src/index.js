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

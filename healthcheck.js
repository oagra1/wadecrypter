const http = require('http');

const options = {
  hostname: 'localhost',
  port: process.env.PORT || 3000,
  path: '/health',
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    if (res.statusCode === 200) {
      try {
        const health = JSON.parse(data);
        if (health.status === 'healthy') {
          console.log('Health check passed');
          process.exit(0);
        }
      } catch (error) {
        console.error('Invalid health response');
        process.exit(1);
      }
    }
    console.error('Health check failed:', res.statusCode);
    process.exit(1);
  });
});

req.on('error', (error) => {
  console.error('Health check error:', error.message);
  process.exit(1);
});

req.on('timeout', () => {
  req.destroy();
  console.error('Health check timeout');
  process.exit(1);
});

req.setTimeout(5000);
req.end();

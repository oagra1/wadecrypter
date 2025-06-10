#!/usr/bin/env node

const http = require('http');
const https = require('https');

const config = {
  host: process.env.TEST_HOST || 'localhost',
  port: process.env.TEST_PORT || 3000,
  apiKey: process.env.API_KEY || 'test-key'
};

function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const protocol = options.port === 443 ? https : http;
    
    const req = protocol.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: responseData
        });
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(data);
    }
    
    req.end();
  });
}

async function testHealthCheck() {
  console.log('🏥 Testing health check...');
  
  try {
    const response = await makeRequest({
      hostname: config.host,
      port: config.port,
      path: '/health',
      method: 'GET'
    });
    
    if (response.statusCode === 200) {
      const health = JSON.parse(response.data);
      console.log('✅ Health check passed');
      console.log(`   Status: ${health.status}`);
      console.log(`   Uptime: ${health.uptime}s`);
      console.log(`   Memory: ${health.memory.used}MB / ${health.memory.total}MB`);
      return true;
    } else {
      console.log('❌ Health check failed:', response.statusCode);
      return false;
    }
  } catch (error) {
    console.log('❌ Health check error:', error.message);
    return false;
  }
}

async function testAuthentication() {
  console.log('🔐 Testing authentication...');
  
  // Test without API key
  try {
    const response = await makeRequest({
      hostname: config.host,
      port: config.port,
      path: '/api/v1/decrypt',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, JSON.stringify({
      mediaUrl: 'https://example.com/test',
      mediaKey: 'test',
      mediaType: 'document'
    }));
    
    if (response.statusCode === 401) {
      console.log('✅ Authentication protection working');
    } else {
      console.log('⚠️  Authentication might not be working properly');
    }
  } catch (error) {
    console.log('❌ Authentication test error:', error.message);
  }
}

async function testRateLimit() {
  console.log('🚦 Testing rate limiting...');
  
  const promises = [];
  
  // Make 10 rapid requests
  for (let i = 0; i < 10; i++) {
    promises.push(
      makeRequest({
        hostname: config.host,
        port: config.port,
        path: '/api/v1/decrypt',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.apiKey
        }
      }, JSON.stringify({
        mediaUrl: 'https://example.com/test',
        mediaKey: 'test',
        mediaType: 'document'
      }))
    );
  }
  
  try {
    const responses = await Promise.all(promises);
    const rateLimited = responses.some(r => r.statusCode === 429);
    
    if (rateLimited) {
      console.log('✅ Rate limiting is working');
    } else {
      console.log('⚠️  Rate limiting might be disabled or set too high');
    }
  } catch (error) {
    console.log('❌ Rate limit test error:', error.message);
  }
}

async function runTests() {
  console.log('🧪 WhatsApp Media Decryption Service Test Suite');
  console.log('===============================================');
  console.log(`Testing service at: ${config.host}:${config.port}`);
  console.log('');
  
  const healthOk = await testHealthCheck();
  console.log('');
  
  if (healthOk) {
    await testAuthentication();
    console.log('');
    
    await testRateLimit();
    console.log('');
  }
  
  console.log('🏁 Test suite completed');
  console.log('');
  console.log('💡 To test actual decryption, you need:');
  console.log('   - Valid WhatsApp media URL');
  console.log('   - Corresponding media key');
  console.log('   - Use the provided curl example in README.md');
}

runTests().catch(console.error);

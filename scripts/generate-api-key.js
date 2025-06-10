#!/usr/bin/env node

const crypto = require('crypto');

function generateApiKey(length = 64) {
  return crypto.randomBytes(length).toString('hex');
}

function generateSecureKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
}

console.log('🔐 API Key Generator');
console.log('===================');
console.log('');
console.log('Generated API Keys:');
console.log('');
console.log('Option 1 (Hex):', generateApiKey());
console.log('Option 2 (Base64):', crypto.randomBytes(48).toString('base64'));
console.log('Option 3 (URL-Safe):', generateSecureKey());
console.log('');
console.log('💡 Choose any one of these keys for your API_KEY environment variable');
console.log('⚠️  Keep this key secure and never commit it to version control!');

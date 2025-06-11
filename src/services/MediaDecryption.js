const crypto = require('crypto');
const { DecryptionError, ValidationError } = require('../utils/errors');

class MediaDecryption {
  /**
   * Expand media key using HKDF according to WhatsApp specification
   */
  static expandMediaKey(mediaKeyBase64, mediaType) {
    try {
      // Decode base64 media key
      const mediaKey = Buffer.from(mediaKeyBase64, 'base64');
      
      if (mediaKey.length !== 32) {
        throw new ValidationError(`Invalid media key length: ${mediaKey.length} bytes, expected 32 bytes`);
      }

      // Application info strings for different media types
      const applicationInfo = {
        'image': 'WhatsApp Image Keys',
        'video': 'WhatsApp Video Keys',
        'audio': 'WhatsApp Audio Keys', 
        'document': 'WhatsApp Document Keys'
      };

      const info = applicationInfo[mediaType];
      if (!info) {
        throw new ValidationError(`Unsupported media type: ${mediaType}. Supported: ${Object.keys(applicationInfo).join(', ')}`);
      }

      console.log(`🔑 Using application info: ${info}`);

      // HKDF expansion to 112 bytes
      const salt = Buffer.alloc(32); // Empty salt for WhatsApp
      const expandedKey = crypto.hkdfSync('sha256', mediaKey, salt, info, 112);

      return {
        cipherKey: expandedKey.slice(0, 32),    // AES-256 key
        macKey: expandedKey.slice(32, 64),      // HMAC-SHA256 key  
        iv: expandedKey.slice(64, 80),          // Initialization vector (16 bytes)
        // Remaining 32 bytes reserved
      };

    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DecryptionError('Failed to expand media key', error);
    }
  }

  /**
   * Decrypt WhatsApp media data from buffer
   */
  static async decryptData(encryptedData, expandedKey) {
    try {
      if (encryptedData.length < 10) {
        throw new DecryptionError('File too small to be valid encrypted media (minimum 10 bytes)');
      }

      console.log(`📊 Processing encrypted file: ${encryptedData.length} bytes`);

      // Extract MAC from first 10 bytes
      const fileMac = encryptedData.slice(0, 10);
      const encryptedContent = encryptedData.slice(10);

      console.log(`🔐 MAC: ${fileMac.toString('hex')}`);
      console.log(`📦 Encrypted content: ${encryptedContent.length} bytes`);

      // Verify MAC
      const expectedMac = crypto.createHmac('sha256', expandedKey.macKey)
        .update(encryptedContent)
        .digest()
        .slice(0, 10);

      if (!crypto.timingSafeEqual(fileMac, expectedMac)) {
        throw new DecryptionError('MAC verification failed - invalid key or corrupted file');
      }

      console.log('✅ MAC verification passed');

      // Decrypt content using AES-256-CBC
      const decipher = crypto.createDecipheriv('aes-256-cbc', expandedKey.cipherKey, expandedKey.iv);
      
      let decrypted = Buffer.alloc(0);
      decrypted = Buffer.concat([decrypted, decipher.update(encryptedContent)]);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      console.log(`✅ Decryption successful: ${decrypted.length} bytes`);

      return decrypted;

    } catch (error) {
      if (error instanceof DecryptionError) {
        throw error;
      }
      
      // Capturar erros específicos do Node.js crypto
      if (error.message.includes('bad decrypt')) {
        throw new DecryptionError('Invalid media key or IV - decryption failed');
      }
      
      if (error.message.includes('wrong final block length')) {
        throw new DecryptionError('Invalid padding - file may be corrupted');
      }
      
      throw new DecryptionError('Unexpected decryption error', error);
    }
  }

  /**
   * Secure cleanup of key material
   */
  static secureKeyCleanup(expandedKey) {
    try {
      // Zero out sensitive key material
      if (expandedKey.cipherKey) expandedKey.cipherKey.fill(0);
      if (expandedKey.macKey) expandedKey.macKey.fill(0);
      if (expandedKey.iv) expandedKey.iv.fill(0);
      
      console.log('🧹 Key material securely cleaned up');
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    } catch (error) {
      console.warn('⚠️ Error during key cleanup:', error.message);
    }
  }

  /**
   * Get MIME content type for media type
   */
  static getContentType(mediaType) {
    const contentTypes = {
      'image': 'image/jpeg',
      'video': 'video/mp4', 
      'audio': 'audio/mpeg',
      'document': 'application/pdf'
    };
    
    return contentTypes[mediaType] || 'application/octet-stream';
  }

  /**
   * Get file extension for media type
   */
  static getFileExtension(mediaType) {
    const extensions = {
      'image': 'jpg',
      'video': 'mp4',
      'audio': 'mp3', 
      'document': 'pdf'
    };
    
    return extensions[mediaType] || 'bin';
  }
}

module.exports = MediaDecryption;

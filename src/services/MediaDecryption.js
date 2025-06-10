const crypto = require('crypto');
const logger = require('../utils/logger');
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
        throw new ValidationError(`Invalid media key length: ${mediaKey.length}, expected 32 bytes`);
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
        throw new ValidationError(`Unsupported media type: ${mediaType}`);
      }

      // HKDF expansion to 112 bytes
      const salt = Buffer.alloc(32); // Empty salt for WhatsApp
      const expandedKey = crypto.hkdfSync('sha256', mediaKey, salt, info, 112);

      return {
        cipherKey: expandedKey.slice(0, 32),    // AES-256 key
        macKey: expandedKey.slice(32, 64),      // HMAC-SHA256 key
        iv: expandedKey.slice(64, 80),          // Initialization vector (16 bytes)
        // Remaining 32 bytes for future use
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
        throw new DecryptionError('File too small to be valid encrypted media');
      }

      // Extract MAC from first 10 bytes
      const fileMac = encryptedData.slice(0, 10);
      const encryptedContent = encryptedData.slice(10);

      // Verify MAC
      const expectedMac = crypto.createHmac('sha256', expandedKey.macKey)
        .update(encryptedContent)
        .digest()
        .slice(0, 10);

      if (!crypto.timingSafeEqual(fileMac, expectedMac)) {
        throw new DecryptionError('MAC verification failed - invalid key or corrupted file');
      }

      // Decrypt content
      const decipher = crypto.createDecipheriv('aes-256-cbc', expandedKey.cipherKey, expandedKey.iv);
      
      let decrypted = Buffer.alloc(0);
      decrypted = Buffer.concat([decrypted, decipher.update(encryptedContent)]);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      logger.info('Media data decryption successful', {
        originalSize: encryptedData.length,
        decryptedSize: decrypted.length
      });

      return decrypted;

    } catch (error) {
      if (error instanceof DecryptionError) {
        throw error;
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
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    } catch (error) {
      logger.warn('Error during key cleanup', error);
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
      'document': 'application/octet-stream'
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
      'document': 'bin'
    };
    
    return extensions[mediaType] || 'bin';
  }
}

module.exports = MediaDecryption;

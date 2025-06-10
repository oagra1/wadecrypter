const fetch = require('node-fetch');
const logger = require('../utils/logger');
const { NetworkError } = require('../utils/errors');

class MediaDownload {
  static async downloadMedia(mediaUrl, options = {}) {
    const {
      timeout = 60000,
      retries = 3,
      retryDelay = 1000
    } = options;

    let lastError;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        logger.info(`Downloading media attempt ${attempt}/${retries}`, {
          url: mediaUrl.substring(0, 50) + '...'
        });

        const response = await fetch(mediaUrl, {
          timeout,
          headers: {
            'User-Agent': 'WhatsApp/2.23.20 (iPhone; iOS 16.6; Scale/3.00)',
            'Accept': '*/*',
            'Accept-Encoding': 'identity', // Don't use compression for encrypted data
            'Connection': 'keep-alive'
          }
        });

        if (!response.ok) {
          throw new NetworkError(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          const sizeMB = Math.round(parseInt(contentLength) / 1024 / 1024);
          logger.info(`Downloading ${sizeMB}MB file`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        
        logger.info('Media download completed', {
          size: buffer.length,
          attempt
        });

        return buffer;

      } catch (error) {
        lastError = error;
        
        if (attempt < retries) {
          logger.warn(`Download attempt ${attempt} failed, retrying in ${retryDelay}ms`, {
            error: error.message
          });
          
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        } else {
          logger.error('All download attempts failed', {
            error: error.message,
            attempts: retries
          });
        }
      }
    }

    throw new NetworkError(`Failed to download media after ${retries} attempts: ${lastError.message}`, lastError);
  }

  static validateUrl(url) {
    try {
      const urlObj = new URL(url);
      
      // Check if it's HTTPS (required for WhatsApp media)
      if (urlObj.protocol !== 'https:') {
        throw new Error('URL must use HTTPS protocol');
      }

      // Basic WhatsApp media URL validation
      const validHosts = [
        'mmg.whatsapp.net',
        'mmg-fna.whatsapp.net',
        'media-frt3-1.cdn.whatsapp.net',
        'pps.whatsapp.net'
      ];

      if (!validHosts.some(host => urlObj.hostname.includes(host))) {
        logger.warn('URL may not be a valid WhatsApp media URL', {
          hostname: urlObj.hostname
        });
      }

      return true;
    } catch (error) {
      throw new Error(`Invalid media URL: ${error.message}`);
    }
  }
}

module.exports = MediaDownload;

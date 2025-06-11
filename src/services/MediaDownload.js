const fetch = require('node-fetch');
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
        console.log(`📥 Download attempt ${attempt}/${retries}`);

        const response = await fetch(mediaUrl, {
          timeout,
          headers: {
            'User-Agent': 'WhatsApp/2.23.20 (iPhone; iOS 16.6; Scale/3.00)',
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache'
          }
        });

        if (!response.ok) {
          throw new NetworkError(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          const sizeMB = Math.round(parseInt(contentLength) / 1024 / 1024);
          console.log(`📊 File size: ${sizeMB}MB`);
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        
        console.log(`✅ Download completed: ${buffer.length} bytes`);
        return buffer;

      } catch (error) {
        lastError = error;
        
        if (attempt < retries) {
          console.log(`⚠️ Attempt ${attempt} failed, retrying in ${retryDelay * attempt}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        } else {
          console.error(`❌ All ${retries} download attempts failed`);
        }
      }
    }

    throw new NetworkError(`Failed to download after ${retries} attempts: ${lastError.message}`, lastError);
  }

  static validateUrl(url) {
    try {
      const urlObj = new URL(url);
      
      if (urlObj.protocol !== 'https:') {
        throw new Error('URL must use HTTPS protocol');
      }

      // Validação básica para URLs do WhatsApp
      const validHosts = [
        'mmg.whatsapp.net',
        'mmg-fna.whatsapp.net', 
        'media-frt3-1.cdn.whatsapp.net',
        'pps.whatsapp.net'
      ];

      const isValidHost = validHosts.some(host => urlObj.hostname.includes(host));
      if (!isValidHost) {
        console.log(`⚠️ Warning: URL may not be a valid WhatsApp media URL (${urlObj.hostname})`);
      }

      return true;
    } catch (error) {
      throw new Error(`Invalid media URL: ${error.message}`);
    }
  }
}

module.exports = MediaDownload;

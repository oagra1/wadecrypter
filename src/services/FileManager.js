const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class FileManager {
  constructor() {
    this.tempDir = process.env.TEMP_DIR || '/tmp/media-decrypt';
    this.cleanupInterval = parseInt(process.env.CLEANUP_INTERVAL) || 3600000; // 1 hour
    this.maxFileAge = parseInt(process.env.MAX_FILE_AGE) || 3600000; // 1 hour
    
    this.startCleanupScheduler();
  }

  async ensureDirectories() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      logger.info('Directories ensured', { tempDir: this.tempDir });
    } catch (error) {
      logger.error('Failed to create directories', error);
      throw error;
    }
  }

  async cleanupOldFiles() {
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      let cleanedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        
        try {
          const stats = await fs.stat(filePath);
          
          if (now - stats.mtime.getTime() > this.maxFileAge) {
            await fs.unlink(filePath);
            cleanedCount++;
          }
        } catch (error) {
          // File might have been deleted, ignore
          continue;
        }
      }

      if (cleanedCount > 0) {
        logger.info('Cleanup completed', { cleanedFiles: cleanedCount });
      }

    } catch (error) {
      logger.error('Cleanup error', error);
    }
  }

  startCleanupScheduler() {
    setInterval(() => {
      this.cleanupOldFiles();
    }, this.cleanupInterval);
    
    logger.info('Cleanup scheduler started', { 
      interval: this.cleanupInterval / 1000 + 's',
      maxAge: this.maxFileAge / 1000 + 's'
    });
  }

  async cleanup() {
    await this.cleanupOldFiles();
  }
}

module.exports = new FileManager();

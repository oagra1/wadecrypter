class DecryptionError extends Error {
  constructor(message, originalError = null) {
    super(message);
    this.name = 'DecryptionError';
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
  }
}

class NetworkError extends Error {
  constructor(message, originalError = null) {
    super(message);
    this.name = 'NetworkError';
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
  }
}

class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.timestamp = new Date().toISOString();
  }
}

class ProcessingError extends Error {
  constructor(message, originalError = null) {
    super(message);
    this.name = 'ProcessingError';
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
  }
}

module.exports = {
  DecryptionError,
  NetworkError,
  ValidationError,
  ProcessingError
};

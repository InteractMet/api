export class WebvoxError extends Error {
  constructor(message, code = 'WEBVOX_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AuthenticationError extends WebvoxError {
  constructor(message = 'Authentication failed') {
    super(message, 'AUTH_ERROR');
  }
}

export class ConnectionError extends WebvoxError {
  constructor(message = 'Connection failed', service = 'webvox') {
    super(message, 'CONNECTION_ERROR');
    this.service = service;
  }
}

export class ValidationError extends WebvoxError {
  constructor(message = 'Validation failed') {
    super(message, 'VALIDATION_ERROR');
  }
}

export class ServiceUnavailableError extends WebvoxError {
  constructor(service) {
    super(`${service} service is unavailable`, 'SERVICE_UNAVAILABLE');
    this.service = service;
  }
}

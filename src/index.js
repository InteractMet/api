export { WebvoxClient } from './WebvoxClient.js';
export { SFUManager } from './managers/SFUManager.js';

/**
 * @deprecated AuthManager is deprecated. Use API key authentication instead.
 * Will be removed in v3.0.0
 */
export { AuthManager } from './managers/AuthManager.js';

export {
  WebvoxError,
  AuthenticationError,
  ConnectionError,
  ValidationError,
  ServiceUnavailableError,
} from './errors/WebvoxError.js';

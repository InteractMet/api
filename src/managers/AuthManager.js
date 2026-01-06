import { EventEmitter } from '../utils/EventEmitter.js';
import { storage } from '../utils/storage.js';
import { AuthenticationError, ValidationError } from '../errors/WebvoxError.js';

/**
 * AuthManager - DEPRECATED
 *
 * @deprecated This class is deprecated and will be removed in a future version.
 * Authentication is now handled via API keys. Please use API key authentication instead.
 *
 * To migrate:
 * 1. Obtain an API key from your admin
 * 2. Pass the API key in WebvoxClient config: new WebvoxClient({ apiKey: 'your-api-key' })
 * 3. Remove all auth.login() and auth.register() calls
 *
 * This class has been kept for backwards compatibility but will be removed in v3.0.0
 */
export class AuthManager extends EventEmitter {
  constructor(httpClient) {
    super();
    console.warn(
      'WARNING: AuthManager is deprecated. Please use API key authentication instead. ' +
      'Pass apiKey in WebvoxClient config: new WebvoxClient({ apiKey: "your-key" })'
    );
    this.httpClient = httpClient;
    this.currentUser = null;
  }

  async register(email, password) {
    throw new AuthenticationError(
      'User registration is no longer supported. Please use API key authentication. ' +
      'Contact your administrator to obtain an API key.'
    );
  }

  async login(email, password) {
    throw new AuthenticationError(
      'User login is no longer supported. Please use API key authentication. ' +
      'Contact your administrator to obtain an API key.'
    );
  }

  async logout() {
    console.warn('logout() is deprecated. API keys do not require logout.');
    this.currentUser = null;
    this.emit('logout');
  }

  async getUser() {
    throw new AuthenticationError(
      'getUser() is no longer supported with API key authentication.'
    );
  }

  getToken() {
    console.warn('getToken() is deprecated. Use API keys instead.');
    return null;
  }

  isAuthenticated() {
    console.warn('isAuthenticated() is deprecated. API keys are validated by the server.');
    return false;
  }

  getCurrentUser() {
    console.warn('getCurrentUser() is deprecated. API keys represent clients, not users.');
    return null;
  }
}

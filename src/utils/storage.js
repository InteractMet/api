/**
 * Storage utility for WebVox client
 *
 * @deprecated Authentication is now handled via API keys passed in config.
 * Storing API keys in localStorage is NOT recommended for production use.
 * Pass API keys via environment variables and config instead.
 */

const API_KEY_STORAGE_KEY = 'webvox_api_key';

export const storage = {
  /**
   * Store API key in localStorage
   * @deprecated Not recommended for production. Pass API key via config instead.
   */
  setApiKey(apiKey) {
    try {
      console.warn('WARNING: Storing API keys in localStorage is not recommended for production.');
      localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    } catch (error) {
      console.error('Failed to store API key:', error);
    }
  },

  /**
   * Retrieve API key from localStorage
   * @deprecated Not recommended for production. Pass API key via config instead.
   */
  getApiKey() {
    try {
      return localStorage.getItem(API_KEY_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to retrieve API key:', error);
      return null;
    }
  },

  /**
   * Remove API key from localStorage
   * @deprecated Not recommended for production.
   */
  removeApiKey() {
    try {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to remove API key:', error);
    }
  },
};

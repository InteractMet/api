/**
 * Debug Logger Utility
 *
 * Production-ready logger that only outputs in development mode or when explicitly enabled.
 *
 * Usage:
 *   import { logger } from './utils/logger';
 *   logger.info('Message');
 *   logger.error('Error message');
 *
 * Enable debug logs in production:
 *   localStorage.setItem('webvox:debug', 'true');
 */

const isDevelopment = import.meta.env.MODE === 'development';
const DEBUG_ENABLED = isDevelopment || localStorage.getItem('webvox:debug') === 'true';

export const logger = {
  /**
   * Info level logging - only in development or when debug is enabled
   */
  info: (...args) => {
    if (DEBUG_ENABLED) {
      console.log(...args);
    }
  },

  /**
   * Error level logging - always enabled (production + development)
   */
  error: (...args) => {
    console.error(...args);
  },

  /**
   * Warning level logging - only in development or when debug is enabled
   */
  warn: (...args) => {
    if (DEBUG_ENABLED) {
      console.warn(...args);
    }
  },

  /**
   * Debug level logging - only in development or when debug is enabled
   */
  debug: (...args) => {
    if (DEBUG_ENABLED) {
      console.debug(...args);
    }
  },

  /**
   * Check if debug logging is enabled
   */
  isDebugEnabled: () => DEBUG_ENABLED,
};

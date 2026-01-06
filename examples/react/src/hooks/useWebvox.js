import { useState, useEffect, useCallback, useRef } from 'react';
import { WebvoxClient } from '../../../../src/index';
import { logger } from '../utils/logger';

export function useWebvox(config = {}) {
  const clientRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initialize client once with API key
  useEffect(() => {
    if (!clientRef.current && config.apiKey) {
      try {
        if(!config.serverUrl){
          throw new Error('Server URL is required. Please provide a server URL.');
        }
        clientRef.current = new WebvoxClient({
          serverUrl: config.serverUrl,
          apiKey: config.apiKey,
          autoConnect: false,
          logger,
          ...config,
        });

        logger.info('WebVox client initialized with API key');
      } catch (err) {
        logger.error('Failed to initialize client:', err);
        setError(err);
      }
    }

    return () => {
      if (clientRef.current) {
        clientRef.current.disconnect();
      }
    };
  }, [config.serverUrl, config.apiKey]);

  const connect = useCallback(async () => {
    if (!clientRef.current) {
      setError(new Error('Client not initialized. Please provide an API key.'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await clientRef.current.connect();
      setIsConnected(true);
      logger.info('Connected to WebVox server');
    } catch (err) {
      logger.error('Connection failed:', err);
      setError(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (!clientRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      clientRef.current.disconnect();
      setIsConnected(false);
      logger.info('Disconnected from WebVox server');
    } catch (err) {
      logger.error('Disconnect failed:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    client: clientRef.current,
    isConnected,
    isLoading,
    error,
    connect,
    disconnect,
  };
}

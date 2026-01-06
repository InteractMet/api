import { io } from 'socket.io-client';
import { SFUManager } from './managers/SFUManager.js';
import { HttpClient } from './utils/HttpClient.js';
import { ConnectionError, ValidationError } from './errors/WebvoxError.js';

export class WebvoxClient {
  constructor(config = {}) {
    // Validate API key is provided
    if (!config.apiKey) {
      throw new ValidationError('API key is required. Please provide an API key in the config.');
    }

    this.config = {
      serverUrl: config.serverUrl || 'http://localhost:4000',
      apiKey: config.apiKey,
      autoConnect: config.autoConnect !== undefined ? config.autoConnect : false,
      logger: config.logger || console,
      socketOptions: config.socketOptions || {},
    };

    this.socket = null;
    this.isConnected = false;

    // Initialize HTTP client with API key getter
    this.httpClient = new HttpClient(
      this.config.serverUrl,
      () => this.config.apiKey
    );

    // Initialize managers
    this.sfu = null; // Will be initialized after socket connection

    // Auto-connect if configured
    if (this.config.autoConnect) {
      this.connect();
    }
  }

  async connect() {
    if (this.isConnected && this.socket && this.socket.connected) {
      console.log('🔗 Already connected to webvox server');
      return;
    }

    return new Promise((resolve, reject) => {
      if (!this.config.apiKey) {
        reject(new ConnectionError('No API key provided. Please provide an API key in the config.', 'Auth'));
        return;
      }

      const socketOptions = {
        ...this.config.socketOptions,
        auth: {
          apiKey: this.config.apiKey,
        },
      };

      console.log(`🔗 Connecting to webvox server at ${this.config.serverUrl}...`);

      this.socket = io(this.config.serverUrl, socketOptions);

      this.socket.on('connect', () => {
        this.isConnected = true;
        console.log('✅ Connected to webvox server successfully');

        // Initialize SFU manager with socket
        if (!this.sfu) {
          this.sfu = new SFUManager(this.socket);
          console.log('✅ SFU manager initialized');
        }

        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ Connection error:', error.message);
        this.isConnected = false;
        reject(new ConnectionError(error.message, 'Socket.IO'));
      });

      this.socket.on('disconnect', (reason) => {
        this.isConnected = false;
        console.warn(`⚠️ Disconnected from webvox server (reason: ${reason})`);
      });

      this.socket.on('error', (error) => {
        console.error('❌ Socket error:', error);
      });
    });
  }

  disconnect() {
    if (this.socket) {
      console.log('🔌 Disconnecting from webvox server...');

      // Disconnect SFU first
      if (this.sfu && this.sfu.isConnected) {
        this.sfu.disconnect();
      }

      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.sfu = null;

      console.log('✅ Disconnected from webvox server');
    }
  }

  getSocket() {
    return this.socket;
  }

  async reconnect() {
    this.disconnect();
    return this.connect();
  }
}

import { EventEmitter } from '../utils/EventEmitter.js';
import { ConnectionError } from '../errors/WebvoxError.js';

export class SFUManager extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.isConnected = false;
    this.currentRoom = null;
    this.currentParticipantId = null; // Track current participant ID
    this.eventHandlers = new Map(); // Track handlers for cleanup
  }

  async connect() {
    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        console.log('🔗 Already connected to SFU server');
        resolve();
        return;
      }

      console.log('🔗 Connecting to SFU via webvox server...');
      this.socket.emit('connect-sfu', (response) => {
        if (response.success) {
          this.isConnected = true;
          console.log('✅ Connected to SFU server successfully');
          this._setupEventHandlers();
          resolve();
        } else {
          console.error('❌ SFU connection failed:', response.error);
          reject(new ConnectionError(response.error || 'SFU connection failed', 'SFU'));
        }
      });
    });
  }

  disconnect() {
    const roomInfo = this.currentRoom ? ` from room '${this.currentRoom}'` : '';
    console.log(`🔌 Disconnecting from SFU${roomInfo}`);
    this.isConnected = false;
    this.currentRoom = null;
    this.currentParticipantId = null;
    this._removeEventHandlers();
    this.removeAllListeners();
    console.log('✅ SFU disconnection complete');
  }

  _removeEventHandlers() {
    // Remove all socket event listeners that we registered
    for (const [event, handler] of this.eventHandlers) {
      this.socket.off(event, handler);
    }
    this.eventHandlers.clear();
  }

  _setupEventHandlers() {
    // Remove old handlers first to prevent duplicates
    this._removeEventHandlers();

    const SFU_EVENTS = [
      'participant-joined',
      'participant-left',
      'new-producer',
      'producer-closed',
      'producer-paused',
      'producer-resumed',
      'consumer-closed',
      'consumer-paused',
      'consumer-resumed',
      'audio-state-changed',
      'video-state-changed',
    ];

    SFU_EVENTS.forEach((event) => {
      const handler = (data) => {
        this._logSfuEvent(event, data);
        this.emit(event, data);
      };
      this.socket.on(event, handler);
      this.eventHandlers.set(event, handler);
    });

    console.log('✅ SFU event handlers configured');
  }

  _logSfuEvent(event, data) {
    const roomInfo = this.currentRoom ? ` in room '${this.currentRoom}'` : '';

    switch (event) {
      case 'participant-joined':
        console.log(`👤 Participant '${data.participantId}' joined${roomInfo}`);
        break;
      case 'participant-left':
        const leftParticipantId = data?.participantId || data?.id || 'unknown';
        if (leftParticipantId === 'unknown') {
          console.warn(`⚠️ Received empty participant-left data from server:`, data);
        }
        console.log(`👋 Participant '${leftParticipantId}' left${roomInfo}`);
        break;
      case 'new-producer':
        console.log(`🎬 New ${data.kind || 'media'} producer from participant '${data.participantId}'${roomInfo}`);
        break;
      case 'producer-closed':
        console.log(`⏹️ Producer closed for participant '${data.participantId}'${roomInfo}`);
        break;
      case 'producer-paused':
        console.log(`⏸️ Producer paused for participant '${data.participantId}'${roomInfo}`);
        break;
      case 'producer-resumed':
        console.log(`▶️ Producer resumed for participant '${data.participantId}'${roomInfo}`);
        break;
      case 'audio-state-changed':
        console.log(`🔊 Audio ${data.muted ? 'muted' : 'unmuted'} for participant '${data.participantId}'${roomInfo}`);
        break;
      case 'video-state-changed':
        console.log(`📹 Video ${data.muted ? 'paused' : 'resumed'} for participant '${data.participantId}'${roomInfo}`);
        break;
      case 'consumer-closed':
      case 'consumer-paused':
      case 'consumer-resumed':
        console.log(`📢 ${event} event received${roomInfo}`, data);
        break;
      default:
        console.log(`📢 SFU event: ${event}${roomInfo}`, data);
    }
  }

  async joinRoom(roomId, participantId) {
    if (!this.isConnected) {
      throw new ConnectionError('Not connected to SFU. Call connect() first.', 'SFU');
    }

    console.log(`🚪 Joining room '${roomId}' as participant '${participantId}'...`);
    return new Promise((resolve, reject) => {
      this.socket.emit('join-room', { roomId, participantId }, (response) => {
        if (response && !response.error) {
          this.currentRoom = roomId;
          this.currentParticipantId = participantId; // Store participant ID
          console.log(`✅ Successfully joined room '${roomId}'`);
          if (response.participants && response.participants.length > 0) {
            console.log(`👥 Found ${response.participants.length} existing participant(s):`, response.participants.map(p => p.id || p).join(', '));
          }
          resolve(response);
        } else {
          console.error(`❌ Failed to join room '${roomId}':`, response?.error);
          reject(new Error(response?.error || 'Failed to join room'));
        }
      });
    });
  }

  async leaveRoom() {
    if (!this.currentRoom) {
      return;
    }

    const leavingRoom = this.currentRoom;
    const leavingParticipantId = this.currentParticipantId;
    console.log(`🚪 Leaving room '${leavingRoom}' as participant '${leavingParticipantId}'...`);

    return new Promise((resolve) => {
      this.socket.emit('leave-room', { roomId: leavingRoom, participantId: leavingParticipantId }, (response) => {
        this.currentRoom = null;
        this.currentParticipantId = null;
        console.log(`✅ Left room '${leavingRoom}' successfully`);
        resolve(response);
      });
    });
  }

  async getRouterCapabilities(roomId) {
    // Use provided roomId or fallback to currentRoom
    const targetRoomId = roomId || this.currentRoom;

    if (!targetRoomId) {
      throw new Error('Room ID is required to get router capabilities');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit('get-router-capabilities', { roomId: targetRoomId }, (response) => {
        if (response && !response.error) {
          resolve(response);
        } else {
          reject(new Error(response?.error || 'Failed to get router capabilities'));
        }
      });
    });
  }

  async setRtpCapabilities(rtpCapabilities) {
    return new Promise((resolve, reject) => {
      this.socket.emit('set-rtp-capabilities', { rtpCapabilities }, (response) => {
        if (!response || !response.error) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  async createTransport(direction) {
    console.log(`🚛 Creating ${direction} transport...`);
    return new Promise((resolve, reject) => {
      // Server expects "type" not "direction"
      this.socket.emit('create-transport', { type: direction }, (response) => {
        if (response && !response.error) {
          console.log(`✅ ${direction} transport created (ID: ${response.id})`);
          resolve(response);
        } else {
          console.error(`❌ Failed to create ${direction} transport:`, response?.error);
          reject(new Error(response?.error || 'Failed to create transport'));
        }
      });
    });
  }

  async connectTransport(transportId, dtlsParameters) {
    return new Promise((resolve, reject) => {
      this.socket.emit('connect-transport', { transportId, dtlsParameters }, (response) => {
        if (!response || !response.error) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  async createProducer(transportId, kind, rtpParameters, appData = {}) {
    console.log(`🎬 Creating ${kind} producer...`);
    return new Promise((resolve, reject) => {
      this.socket.emit('create-producer', { transportId, kind, rtpParameters, appData }, (response) => {
        if (response && response.id) {
          console.log(`✅ ${kind} producer created (ID: ${response.id})`);
          // Server returns { id: producerId }, so normalize it
          resolve({ producerId: response.id });
        } else {
          console.error(`❌ Failed to create ${kind} producer:`, response?.error);
          reject(new Error(response?.error || 'Failed to create producer'));
        }
      });
    });
  }

  async createConsumer(producerParticipantId, producerId) {
    console.log(`📥 Creating consumer for participant '${producerParticipantId}'...`);
    return new Promise((resolve, reject) => {
      // Server expects producerParticipantId and producerId
      this.socket.emit('create-consumer', { producerParticipantId, producerId }, (response) => {
        if (response && response.id) {
          console.log(`✅ Consumer created (ID: ${response.id}, kind: ${response.kind})`);
          // Server returns {id, producerId, kind, rtpParameters, type}
          // Normalize to what examples expect: {consumerId, ...}
          resolve({
            consumerId: response.id,
            producerId: response.producerId,
            kind: response.kind,
            rtpParameters: response.rtpParameters,
            type: response.type
          });
        } else {
          console.error(`❌ Failed to create consumer:`, response?.error);
          reject(new Error(response?.error || 'Failed to create consumer'));
        }
      });
    });
  }

  async pauseProducer(producerId) {
    console.log(`⏸️ Pausing producer (ID: ${producerId})...`);
    return new Promise((resolve) => {
      this.socket.emit('pause-producer', { producerId }, (response) => {
        console.log(`✅ Producer paused`);
        resolve(response);
      });
    });
  }

  async resumeProducer(producerId) {
    console.log(`▶️ Resuming producer (ID: ${producerId})...`);
    return new Promise((resolve) => {
      this.socket.emit('resume-producer', { producerId }, (response) => {
        console.log(`✅ Producer resumed`);
        resolve(response);
      });
    });
  }

  async closeProducer(producerId) {
    console.log(`⏹️ Closing producer (ID: ${producerId})...`);
    return new Promise((resolve) => {
      this.socket.emit('close-producer', { producerId }, (response) => {
        console.log(`✅ Producer closed`);
        resolve(response);
      });
    });
  }

  setAudioState(muted) {
    console.log(`🎤 Audio ${muted ? 'muted' : 'unmuted'}`);
    this.socket.emit('audio-state-changed', { muted });
  }

  setVideoState(muted) {
    console.log(`📹 Video ${muted ? 'paused' : 'resumed'}`);
    this.socket.emit('video-state-changed', { muted });
  }

  getCurrentRoom() {
    return this.currentRoom;
  }
}

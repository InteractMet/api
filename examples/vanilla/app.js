import { WebvoxClient } from '../../src/index.js';
import * as mediasoupClient from 'https://cdn.jsdelivr.net/npm/mediasoup-client@3/+esm';

class WebVoxApp {
  constructor() {
    this.client = null;
    this.device = null;
    this.sendTransport = null;
    this.recvTransport = null;
    this.producers = new Map();
    this.consumers = new Map();
    this.localStream = null;
    this.currentRoom = null;

    this.initializeClient();
    this.setupEventListeners();
  }

  initializeClient() {
    this.client = new WebvoxClient({
      serverUrl: 'http://localhost:4000',
      autoConnect: false,
    });
  }

  setupEventListeners() {
    // Auth buttons
    document.getElementById('loginBtn').addEventListener('click', () => this.handleLogin());
    document.getElementById('registerBtn').addEventListener('click', () => this.handleRegister());
    document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());

    // Room buttons
    document.getElementById('joinRoomBtn').addEventListener('click', () => this.handleJoinRoom());
    document.getElementById('leaveRoomBtn').addEventListener('click', () => this.handleLeaveRoom());

    // Media controls
    document.getElementById('muteBtn').addEventListener('click', () => this.toggleMute());
    document.getElementById('videoBtn').addEventListener('click', () => this.toggleVideo());

    // Auth manager events
    this.client.auth.on('login', (user) => {
      this.showCallSection(user);
    });

    this.client.auth.on('logout', () => {
      this.showAuthSection();
      this.cleanup();
    });
  }

  async handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (!email || !password) {
      this.showError('authError', 'Please enter email and password');
      return;
    }

    try {
      this.showError('authError', '');
      await this.client.auth.login(email, password);
      await this.client.connect();
      this.showSuccess('authSuccess', 'Login successful!');
    } catch (error) {
      this.showError('authError', error.message);
    }
  }

  async handleRegister() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    if (!email || !password) {
      this.showError('authError', 'Please enter email and password');
      return;
    }

    try {
      this.showError('authError', '');
      await this.client.auth.register(email, password);
      await this.client.connect();
      this.showSuccess('authSuccess', 'Registration successful!');
    } catch (error) {
      this.showError('authError', error.message);
    }
  }

  async handleLogout() {
    await this.handleLeaveRoom();
    await this.client.auth.logout();
    this.client.disconnect();
  }

  async handleJoinRoom() {
    const roomId = document.getElementById('roomId').value;

    if (!roomId) {
      this.showError('roomError', 'Please enter a room ID');
      return;
    }

    try {
      this.showError('roomError', '');

      // Connect to SFU
      await this.client.sfu.connect();

      // Join room
      const userId = this.client.auth.getCurrentUser().id;
      await this.client.sfu.joinRoom(roomId, userId);

      this.currentRoom = roomId;

      // Setup mediasoup device
      await this.setupMediasoup();

      // Get local media
      await this.getLocalMedia();

      // Setup SFU event handlers
      this.setupSFUEventHandlers();

      // Update UI
      document.getElementById('joinRoomBtn').classList.add('hidden');
      document.getElementById('leaveRoomBtn').classList.remove('hidden');
      document.getElementById('callControls').classList.remove('hidden');

      this.showSuccess('roomSuccess', `Joined room: ${roomId}`);
    } catch (error) {
      console.error('Failed to join room:', error);
      this.showError('roomError', error.message);
    }
  }

  async handleLeaveRoom() {
    if (!this.currentRoom) return;

    try {
      // Stop local media
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop());
        this.localStream = null;
      }

      // Close all producers
      for (const [id, producer] of this.producers) {
        await this.client.sfu.closeProducer(id);
        producer.close();
      }
      this.producers.clear();

      // Close all consumers
      for (const [id, consumer] of this.consumers) {
        consumer.close();
      }
      this.consumers.clear();

      // Close transports
      if (this.sendTransport) {
        this.sendTransport.close();
        this.sendTransport = null;
      }
      if (this.recvTransport) {
        this.recvTransport.close();
        this.recvTransport = null;
      }

      // Leave room
      await this.client.sfu.leaveRoom();
      this.client.sfu.disconnect();

      this.currentRoom = null;

      // Clear video container
      document.getElementById('videoContainer').innerHTML = '';

      // Update UI
      document.getElementById('joinRoomBtn').classList.remove('hidden');
      document.getElementById('leaveRoomBtn').classList.add('hidden');
      document.getElementById('callControls').classList.add('hidden');

      this.showSuccess('roomSuccess', 'Left room');
    } catch (error) {
      console.error('Failed to leave room:', error);
      this.showError('roomError', error.message);
    }
  }

  async setupMediasoup() {
    // Create mediasoup device
    this.device = new mediasoupClient.Device();

    // Get router capabilities (pass current room ID)
    const routerCapabilities = await this.client.sfu.getRouterCapabilities(this.currentRoom);

    // Load device with router capabilities
    await this.device.load({ routerRtpCapabilities: routerCapabilities.rtpCapabilities });

    // Set RTP capabilities
    await this.client.sfu.setRtpCapabilities(this.device.rtpCapabilities);

    // Create send transport
    const sendTransportData = await this.client.sfu.createTransport('send');
    this.sendTransport = this.device.createSendTransport(sendTransportData);

    this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.client.sfu.connectTransport(sendTransportData.id, dtlsParameters);
        callback();
      } catch (error) {
        errback(error);
      }
    });

    this.sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
      try {
        const { producerId } = await this.client.sfu.createProducer(
          sendTransportData.id,
          kind,
          rtpParameters,
          appData
        );
        callback({ id: producerId });
      } catch (error) {
        errback(error);
      }
    });

    // Create receive transport
    const recvTransportData = await this.client.sfu.createTransport('recv');
    this.recvTransport = this.device.createRecvTransport(recvTransportData);

    this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.client.sfu.connectTransport(recvTransportData.id, dtlsParameters);
        callback();
      } catch (error) {
        errback(error);
      }
    });
  }

  async getLocalMedia() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      // Add local video to UI
      this.addVideoElement('local', this.localStream, 'You');

      // Create producers for each track
      for (const track of this.localStream.getTracks()) {
        const producer = await this.sendTransport.produce({ track });
        this.producers.set(producer.id, producer);

        producer.on('trackended', () => {
          console.log('Track ended:', producer.id);
        });

        producer.on('transportclose', () => {
          console.log('Transport closed:', producer.id);
        });
      }
    } catch (error) {
      console.error('Failed to get local media:', error);
      throw error;
    }
  }

  setupSFUEventHandlers() {
    this.client.sfu.on('participant-joined', (data) => {
      console.log('Participant joined:', data);
    });

    this.client.sfu.on('participant-left', (data) => {
      console.log('Participant left:', data);
      this.removeVideoElement(data.participantId);
    });

    this.client.sfu.on('new-producer', async (data) => {
      console.log('New producer:', data);
      // data contains: { participantId, producerId, kind, type }
      await this.consumeTrack(data.participantId, data.producerId);
    });

    this.client.sfu.on('producer-closed', (data) => {
      console.log('Producer closed:', data);
      const consumer = this.consumers.get(data.producerId);
      if (consumer) {
        consumer.close();
        this.consumers.delete(data.producerId);
      }
    });
  }

  async consumeTrack(participantId, producerId) {
    try {
      const { consumerId, rtpParameters, kind } = await this.client.sfu.createConsumer(
        participantId,
        producerId
      );

      const consumer = await this.recvTransport.consume({
        id: consumerId,
        producerId,
        kind,
        rtpParameters,
      });

      this.consumers.set(producerId, consumer);

      const stream = new MediaStream([consumer.track]);
      this.addVideoElement(producerId, stream, `Participant ${producerId.substring(0, 8)}`);
    } catch (error) {
      console.error('Failed to consume track:', error);
    }
  }

  addVideoElement(id, stream, label) {
    const container = document.getElementById('videoContainer');

    // Remove existing video if it exists
    const existing = document.getElementById(`video-${id}`);
    if (existing) {
      existing.remove();
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'video-wrapper';
    wrapper.id = `video-${id}`;

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = id === 'local'; // Mute local video to prevent feedback

    const labelDiv = document.createElement('div');
    labelDiv.className = 'video-label';
    labelDiv.textContent = label;

    wrapper.appendChild(video);
    wrapper.appendChild(labelDiv);
    container.appendChild(wrapper);
  }

  removeVideoElement(id) {
    const element = document.getElementById(`video-${id}`);
    if (element) {
      element.remove();
    }
  }

  async toggleMute() {
    const audioProducer = Array.from(this.producers.values()).find(p => p.kind === 'audio');
    if (!audioProducer) return;

    const btn = document.getElementById('muteBtn');

    if (audioProducer.paused) {
      await this.client.sfu.resumeProducer(audioProducer.id);
      btn.textContent = 'Mute';
    } else {
      await this.client.sfu.pauseProducer(audioProducer.id);
      btn.textContent = 'Unmute';
    }
  }

  async toggleVideo() {
    const videoProducer = Array.from(this.producers.values()).find(p => p.kind === 'video');
    if (!videoProducer) return;

    const btn = document.getElementById('videoBtn');

    if (videoProducer.paused) {
      await this.client.sfu.resumeProducer(videoProducer.id);
      btn.textContent = 'Stop Video';
    } else {
      await this.client.sfu.pauseProducer(videoProducer.id);
      btn.textContent = 'Start Video';
    }
  }

  showAuthSection() {
    document.getElementById('authSection').style.display = 'block';
    document.getElementById('callSection').classList.remove('active');
  }

  showCallSection(user) {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('callSection').classList.add('active');
    document.getElementById('userEmail').textContent = user.email;
  }

  showError(elementId, message) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.classList.toggle('active', !!message);
  }

  showSuccess(elementId, message) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.classList.toggle('active', !!message);

    if (message) {
      setTimeout(() => {
        element.classList.remove('active');
      }, 3000);
    }
  }

  cleanup() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    this.producers.clear();
    this.consumers.clear();

    if (this.sendTransport) {
      this.sendTransport.close();
      this.sendTransport = null;
    }

    if (this.recvTransport) {
      this.recvTransport.close();
      this.recvTransport = null;
    }

    this.device = null;
    this.currentRoom = null;

    document.getElementById('videoContainer').innerHTML = '';
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new WebVoxApp());
} else {
  new WebVoxApp();
}

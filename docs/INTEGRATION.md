# WebVox Client SDK - Integration Guide

Complete guide for integrating WebVox Client SDK into your JavaScript application.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Authentication](#authentication)
- [Video Calling (SFU)](#video-calling-sfu)
- [Framework Integration](#framework-integration)
  - [Vanilla JavaScript](#vanilla-javascript)
  - [React](#react)
  - [Vue.js](#vuejs)
  - [Angular](#angular)
- [Error Handling](#error-handling)
- [Events](#events)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Installation

### Option 1: Local Development

If you're developing locally with the WebVox source code:

```javascript
import { WebvoxClient } from './path/to/webvox/client/src/index.js';
```

### Option 2: NPM Package (Future)

Once published to npm:

```bash
npm install webvox-client
```

```javascript
import { WebvoxClient } from 'webvox-client';
```

### Dependencies

The SDK requires:

- `socket.io-client` - WebSocket communication
- `mediasoup-client` - WebRTC media handling (for video calling)

Install dependencies:

```bash
npm install socket.io-client mediasoup-client
```

## Quick Start

### 1. Initialize the Client

```javascript
import { WebvoxClient } from 'webvox-client';

const client = new WebvoxClient({
  serverUrl: 'http://localhost:4000',
  autoConnect: false, // Set to true to connect immediately
});
```

### 2. Authenticate

```javascript
// Register a new user
await client.auth.register('user@example.com', 'password123');

// Or login with existing credentials
await client.auth.login('user@example.com', 'password123');

// Connect to server
await client.connect();
```

### 3. Join a Video Call

```javascript
// Connect to SFU
await client.sfu.connect();

// Join a room
const userId = client.auth.getCurrentUser().id;
await client.sfu.joinRoom('my-room-id', userId);

// Get local media
const stream = await navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
});

// Create mediasoup device and setup transports
// See complete example below
```

## Authentication

### Registration

Create a new user account:

```javascript
try {
  const response = await client.auth.register(email, password);
  console.log('Registered user:', response.user);
  console.log('Token:', response.token);
} catch (error) {
  if (error.code === 'VALIDATION_ERROR') {
    console.error('Invalid input:', error.message);
  } else if (error.code === 'AUTH_ERROR') {
    console.error('Registration failed:', error.message);
  }
}
```

### Login

Sign in with existing credentials:

```javascript
try {
  const response = await client.auth.login(email, password);
  console.log('Logged in user:', response.user);
} catch (error) {
  if (error.code === 'AUTH_ERROR') {
    console.error('Invalid credentials');
  }
}
```

### Logout

```javascript
await client.auth.logout();
client.disconnect();
```

### Check Authentication Status

```javascript
const isAuthenticated = client.auth.isAuthenticated();
const currentUser = client.auth.getCurrentUser();
const token = client.auth.getToken();
```

### Authentication Events

```javascript
client.auth.on('login', (user) => {
  console.log('User logged in:', user);
});

client.auth.on('logout', () => {
  console.log('User logged out');
});

client.auth.on('token-expired', () => {
  console.log('Session expired, please login again');
});
```

## Video Calling (SFU)

Complete example of setting up a video call:

### 1. Setup Mediasoup Device

```javascript
import * as mediasoupClient from 'mediasoup-client';

// Create device
const device = new mediasoupClient.Device();

// Get router capabilities from server (pass roomId)
const routerCaps = await client.sfu.getRouterCapabilities(roomId);

// Load device with capabilities
await device.load({
  routerRtpCapabilities: routerCaps.rtpCapabilities
});

// Set client RTP capabilities
await client.sfu.setRtpCapabilities(device.rtpCapabilities);
```

### 2. Create Transports

```javascript
// Create send transport (for local media)
const sendTransportData = await client.sfu.createTransport('send');
const sendTransport = device.createSendTransport(sendTransportData);

sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
  try {
    await client.sfu.connectTransport(
      sendTransportData.id,
      dtlsParameters
    );
    callback();
  } catch (error) {
    errback(error);
  }
});

sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
  try {
    const { producerId } = await client.sfu.createProducer(
      sendTransportData.id,
      kind,
      rtpParameters
    );
    callback({ id: producerId });
  } catch (error) {
    errback(error);
  }
});

// Create receive transport (for remote media)
const recvTransportData = await client.sfu.createTransport('recv');
const recvTransport = device.createRecvTransport(recvTransportData);

recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
  try {
    await client.sfu.connectTransport(
      recvTransportData.id,
      dtlsParameters
    );
    callback();
  } catch (error) {
    errback(error);
  }
});
```

### 3. Produce Local Media

```javascript
// Get local media stream
const stream = await navigator.mediaDevices.getUserMedia({
  video: { width: 1280, height: 720 },
  audio: true
});

// Display local video
const localVideo = document.getElementById('local-video');
localVideo.srcObject = stream;

// Produce each track
const producers = [];
for (const track of stream.getTracks()) {
  const producer = await sendTransport.produce({ track });
  producers.push(producer);

  producer.on('trackended', () => {
    console.log('Track ended');
  });
}
```

### 4. Consume Remote Media

```javascript
// Listen for new producers (remote participants)
client.sfu.on('new-producer', async (data) => {
  const { producerId } = data;

  // Create consumer
  const { consumerId, rtpParameters, kind } = await client.sfu.createConsumer(
    recvTransport.id,
    producerId,
    device.rtpCapabilities
  );

  // Consume the track
  const consumer = await recvTransport.consume({
    id: consumerId,
    producerId,
    kind,
    rtpParameters
  });

  // Create stream and display
  const stream = new MediaStream([consumer.track]);
  const remoteVideo = document.createElement('video');
  remoteVideo.srcObject = stream;
  remoteVideo.autoplay = true;
  document.getElementById('remote-videos').appendChild(remoteVideo);
});
```

### 5. Media Controls

```javascript
// Mute/Unmute audio
const audioProducer = producers.find(p => p.kind === 'audio');
await client.sfu.pauseProducer(audioProducer.id);  // Mute
await client.sfu.resumeProducer(audioProducer.id); // Unmute

// Stop/Start video
const videoProducer = producers.find(p => p.kind === 'video');
await client.sfu.pauseProducer(videoProducer.id);  // Stop
await client.sfu.resumeProducer(videoProducer.id); // Start

// Close producer
await client.sfu.closeProducer(producer.id);
```

### 6. Leave Room

```javascript
// Stop local media
stream.getTracks().forEach(track => track.stop());

// Close all producers
for (const producer of producers) {
  await client.sfu.closeProducer(producer.id);
  producer.close();
}

// Close transports
sendTransport.close();
recvTransport.close();

// Leave room
await client.sfu.leaveRoom();
client.sfu.disconnect();
```

### SFU Events

```javascript
// Participant joined
client.sfu.on('participant-joined', (data) => {
  console.log('Participant joined:', data.participantId);
});

// Participant left
client.sfu.on('participant-left', (data) => {
  console.log('Participant left:', data.participantId);
  // Remove their video element
});

// Producer closed
client.sfu.on('producer-closed', (data) => {
  console.log('Producer closed:', data.producerId);
  // Clean up consumer
});

// Audio state changed
client.sfu.on('audio-state-changed', (data) => {
  console.log('Audio muted:', data.muted);
});
```

## Framework Integration

### Vanilla JavaScript

See [examples/vanilla](../examples/vanilla/) for a complete working example.

```javascript
import { WebvoxClient } from './webvox-client.js';

class VideoCallApp {
  constructor() {
    this.client = new WebvoxClient({
      serverUrl: 'http://localhost:4000'
    });
    this.setupEventListeners();
  }

  setupEventListeners() {
    document.getElementById('login-btn').addEventListener('click',
      () => this.handleLogin()
    );
  }

  async handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    await this.client.auth.login(email, password);
    await this.client.connect();
  }
}

new VideoCallApp();
```

### React

See [examples/react](../examples/react/) for a complete working example.

Create a custom hook:

```jsx
// hooks/useWebvox.js
import { useState, useEffect, useRef } from 'react';
import { WebvoxClient } from 'webvox-client';

export function useWebvox() {
  const clientRef = useRef(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    clientRef.current = new WebvoxClient({
      serverUrl: 'http://localhost:4000'
    });

    clientRef.current.auth.on('login', (userData) => {
      setUser(userData);
    });

    clientRef.current.auth.on('logout', () => {
      setUser(null);
    });

    return () => {
      clientRef.current.disconnect();
    };
  }, []);

  const login = async (email, password) => {
    await clientRef.current.auth.login(email, password);
    await clientRef.current.connect();
  };

  return { client: clientRef.current, user, login };
}
```

Use in components:

```jsx
function App() {
  const { client, user, login } = useWebvox();

  if (!user) {
    return <Login onLogin={login} />;
  }

  return <VideoCall client={client} user={user} />;
}
```

### Vue.js

Create a composable:

```javascript
// composables/useWebvox.js
import { ref, onMounted, onUnmounted } from 'vue';
import { WebvoxClient } from 'webvox-client';

export function useWebvox() {
  const client = ref(null);
  const user = ref(null);

  onMounted(() => {
    client.value = new WebvoxClient({
      serverUrl: 'http://localhost:4000'
    });

    client.value.auth.on('login', (userData) => {
      user.value = userData;
    });

    client.value.auth.on('logout', () => {
      user.value = null;
    });
  });

  onUnmounted(() => {
    client.value?.disconnect();
  });

  const login = async (email, password) => {
    await client.value.auth.login(email, password);
    await client.value.connect();
  };

  return { client, user, login };
}
```

Use in components:

```vue
<script setup>
import { useWebvox } from '@/composables/useWebvox';

const { client, user, login } = useWebvox();

async function handleLogin() {
  await login(email.value, password.value);
}
</script>
```

### Angular

Create a service:

```typescript
// services/webvox.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { WebvoxClient } from 'webvox-client';

@Injectable({
  providedIn: 'root'
})
export class WebvoxService {
  private client: WebvoxClient;
  private userSubject = new BehaviorSubject(null);

  user$ = this.userSubject.asObservable();

  constructor() {
    this.client = new WebvoxClient({
      serverUrl: 'http://localhost:4000'
    });

    this.client.auth.on('login', (user) => {
      this.userSubject.next(user);
    });

    this.client.auth.on('logout', () => {
      this.userSubject.next(null);
    });
  }

  async login(email: string, password: string) {
    await this.client.auth.login(email, password);
    await this.client.connect();
  }

  getClient() {
    return this.client;
  }
}
```

Use in components:

```typescript
import { Component } from '@angular/core';
import { WebvoxService } from './services/webvox.service';

@Component({
  selector: 'app-root',
  template: `...`
})
export class AppComponent {
  constructor(public webvox: WebvoxService) {}

  async login(email: string, password: string) {
    await this.webvox.login(email, password);
  }
}
```

## Error Handling

### Error Types

The SDK provides custom error classes:

```javascript
import {
  WebvoxError,
  AuthenticationError,
  ConnectionError,
  ValidationError,
  ServiceUnavailableError
} from 'webvox-client';
```

### Handling Errors

```javascript
try {
  await client.auth.login(email, password);
} catch (error) {
  switch (error.code) {
    case 'AUTH_ERROR':
      console.error('Authentication failed:', error.message);
      break;
    case 'VALIDATION_ERROR':
      console.error('Invalid input:', error.message);
      break;
    case 'CONNECTION_ERROR':
      console.error('Connection failed:', error.message, error.service);
      break;
    case 'SERVICE_UNAVAILABLE':
      console.error('Service unavailable:', error.service);
      break;
    default:
      console.error('Unknown error:', error);
  }
}
```

### Common Error Scenarios

**Invalid Credentials:**
```javascript
try {
  await client.auth.login(email, password);
} catch (error) {
  if (error.code === 'AUTH_ERROR') {
    alert('Invalid email or password');
  }
}
```

**Connection Issues:**
```javascript
try {
  await client.connect();
} catch (error) {
  if (error.code === 'CONNECTION_ERROR') {
    alert('Could not connect to server. Please check your internet connection.');
  }
}
```

**Not Authenticated:**
```javascript
try {
  await client.sfu.connect();
} catch (error) {
  if (error.code === 'AUTH_ERROR') {
    alert('Please login first');
  }
}
```

## Events

### Authentication Events

```javascript
client.auth.on('login', (user) => {
  // User logged in
});

client.auth.on('logout', () => {
  // User logged out
});

client.auth.on('token-expired', () => {
  // Token expired, need to re-authenticate
});
```

### SFU Events

```javascript
client.sfu.on('participant-joined', (data) => {
  // { participantId, roomId }
});

client.sfu.on('participant-left', (data) => {
  // { participantId, roomId }
});

client.sfu.on('new-producer', (data) => {
  // { producerId, participantId, kind }
});

client.sfu.on('producer-closed', (data) => {
  // { producerId, participantId }
});

client.sfu.on('audio-state-changed', (data) => {
  // { participantId, muted }
});
```

## Best Practices

### 1. Initialize Client Once

Create a single client instance and reuse it:

```javascript
// Good
const client = new WebvoxClient({ serverUrl: 'http://localhost:4000' });

// Bad - Don't create multiple instances
function login() {
  const client = new WebvoxClient({ ... });
}
```

### 2. Clean Up Resources

Always clean up when leaving a call:

```javascript
async function leaveCall() {
  // Stop media tracks
  localStream.getTracks().forEach(track => track.stop());

  // Close producers and consumers
  producers.forEach(p => p.close());
  consumers.forEach(c => c.close());

  // Close transports
  sendTransport.close();
  recvTransport.close();

  // Leave room
  await client.sfu.leaveRoom();
}
```

### 3. Handle Network Issues

Implement reconnection logic:

```javascript
client.socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') {
    // Server disconnected, reconnect manually
    client.connect();
  }
  // else socket will automatically try to reconnect
});
```

### 4. Validate Input

Always validate user input before API calls:

```javascript
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

if (!validateEmail(email)) {
  throw new ValidationError('Invalid email format');
}
```

### 5. Use Environment Variables

Don't hardcode server URLs:

```javascript
const client = new WebvoxClient({
  serverUrl: import.meta.env.VITE_WEBVOX_SERVER_URL || 'http://localhost:4000'
});
```

## Troubleshooting

### Camera/Microphone Not Working

**Problem:** getUserMedia fails or doesn't show video

**Solutions:**
- Ensure page is served over HTTPS (required for getUserMedia in production)
- Check browser permissions for camera/microphone
- Verify no other app is using the camera
- Try different browsers

```javascript
try {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });
} catch (error) {
  if (error.name === 'NotAllowedError') {
    alert('Please allow camera and microphone access');
  } else if (error.name === 'NotFoundError') {
    alert('No camera or microphone found');
  }
}
```

### Connection Errors

**Problem:** Cannot connect to WebVox server

**Solutions:**
- Verify server is running
- Check server URL is correct
- Check CORS configuration on server
- Verify authentication token is valid

### Video Not Showing

**Problem:** Local or remote video not displaying

**Solutions:**
- Check video element has `autoplay` and `playsInline` attributes
- Verify stream is attached to video element
- Check WebRTC transport state
- Look for errors in browser console

```javascript
const video = document.createElement('video');
video.autoplay = true;
video.playsInline = true;
video.muted = isLocal; // Mute local video to prevent feedback
video.srcObject = stream;
```

### Room Join Failures

**Problem:** Cannot join a room

**Solutions:**
- Ensure user is authenticated
- Verify SFU service is running
- Check room ID is valid
- Ensure mediasoup device is properly loaded

### Memory Leaks

**Problem:** App becomes slow over time

**Solutions:**
- Remove event listeners when cleaning up
- Close all transports and producers
- Stop all media tracks
- Clear references to streams

```javascript
// Clean up properly
client.sfu.removeAllListeners();
stream.getTracks().forEach(track => track.stop());
producers.clear();
consumers.clear();
```

### Token Expiration

**Problem:** Token expires during session

**Solution:** Listen for token-expired event and re-authenticate

```javascript
client.auth.on('token-expired', async () => {
  // Show login modal
  // Or try to refresh token
  await client.auth.login(savedEmail, savedPassword);
  await client.connect();
});
```

## Next Steps

- Check out the [Vanilla JavaScript Example](../examples/vanilla/)
- Check out the [React Example](../examples/react/)
- Read the [API Documentation](./API.md) for detailed API reference
- Explore advanced features like screen sharing, recording, etc.

# WebVox Client SDK

A lightweight, framework-agnostic JavaScript SDK for building real-time video calling applications with WebVox.

## Features

- **Authentication** - User registration, login, and session management
- **SFU Video Calling** - Multi-participant video calls using mediasoup
- **Framework Agnostic** - Works with React, Vue, Angular, or vanilla JavaScript
- **TypeScript Ready** - Type definitions coming soon
- **Real-time Events** - Event-driven architecture for real-time updates
- **Lightweight** - Minimal dependencies, tree-shakeable

## Quick Start

### Installation

```bash
# Install dependencies
npm install socket.io-client mediasoup-client
```

### Basic Usage

```javascript
import { WebvoxClient } from './path/to/client/src/index.js';

// Initialize client
const client = new WebvoxClient({
  serverUrl: 'http://localhost:4000'
});

// Authenticate
await client.auth.login('user@example.com', 'password');
await client.connect();

// Join video call
await client.sfu.connect();
await client.sfu.joinRoom('room-123', 'user-id');
```

## Examples

We provide complete working examples for different use cases:

### Vanilla JavaScript

A pure JavaScript implementation without any framework.

[View Vanilla Example →](./examples/vanilla/)

```bash
cd examples/vanilla
python3 -m http.server 8080
```

### React

React integration with custom hooks and components.

[View React Example →](./examples/react/)

```bash
cd examples/react
npm install
npm run dev
```

## Documentation

- **[Integration Guide](./docs/INTEGRATION.md)** - Complete integration guide with examples
- **[API Reference](./docs/API.md)** - Detailed API documentation (coming soon)

## Architecture

The SDK is organized into focused modules:

```
client/
├── src/
│   ├── WebvoxClient.js          # Main SDK class
│   ├── managers/
│   │   ├── AuthManager.js       # Authentication
│   │   └── SFUManager.js        # Video calling (SFU)
│   ├── utils/
│   │   ├── EventEmitter.js      # Event system
│   │   ├── HttpClient.js        # HTTP requests
│   │   └── storage.js           # Token storage
│   └── errors/
│       └── WebvoxError.js       # Custom errors
```

## Core Concepts

### WebvoxClient

The main SDK class that orchestrates all functionality:

```javascript
const client = new WebvoxClient({
  serverUrl: 'http://localhost:4000',
  autoConnect: false,
  logger: console,
});
```

### AuthManager

Handles user authentication:

```javascript
// Register
await client.auth.register(email, password);

// Login
await client.auth.login(email, password);

// Logout
await client.auth.logout();

// Check status
const isAuth = client.auth.isAuthenticated();
const user = client.auth.getCurrentUser();
```

### SFUManager

Manages video calling with mediasoup SFU:

```javascript
// Connect to SFU
await client.sfu.connect();

// Join room
await client.sfu.joinRoom(roomId, participantId);

// Get router capabilities
const caps = await client.sfu.getRouterCapabilities(roomId);

// Create transport
const transport = await client.sfu.createTransport('send');

// Create producer
const { producerId } = await client.sfu.createProducer(
  transportId, 'video', rtpParameters
);

// Leave room
await client.sfu.leaveRoom();
```

## Events

The SDK uses an event-driven architecture:

### Authentication Events

```javascript
client.auth.on('login', (user) => {
  console.log('User logged in:', user);
});

client.auth.on('logout', () => {
  console.log('User logged out');
});

client.auth.on('token-expired', () => {
  console.log('Session expired');
});
```

### SFU Events

```javascript
client.sfu.on('participant-joined', (data) => {
  console.log('Participant joined:', data.participantId);
});

client.sfu.on('participant-left', (data) => {
  console.log('Participant left:', data.participantId);
});

client.sfu.on('new-producer', (data) => {
  console.log('New media producer:', data.producerId);
});

client.sfu.on('producer-closed', (data) => {
  console.log('Producer closed:', data.producerId);
});
```

## Framework Integration

### React Hook

```jsx
import { useWebvox } from './hooks/useWebvox';

function App() {
  const { client, user, login, logout } = useWebvox();

  return user ? (
    <VideoCall client={client} />
  ) : (
    <Login onLogin={login} />
  );
}
```

### Vue Composable

```vue
<script setup>
import { useWebvox } from '@/composables/useWebvox';

const { client, user, login } = useWebvox();
</script>
```

### Angular Service

```typescript
@Injectable({ providedIn: 'root' })
export class WebvoxService {
  private client: WebvoxClient;

  constructor() {
    this.client = new WebvoxClient({
      serverUrl: 'http://localhost:4000'
    });
  }
}
```

## Error Handling

The SDK provides custom error classes for better error handling:

```javascript
import {
  WebvoxError,
  AuthenticationError,
  ConnectionError,
  ValidationError,
  ServiceUnavailableError
} from 'webvox-client';

try {
  await client.auth.login(email, password);
} catch (error) {
  if (error.code === 'AUTH_ERROR') {
    console.error('Invalid credentials');
  } else if (error.code === 'CONNECTION_ERROR') {
    console.error('Connection failed:', error.service);
  }
}
```

## Browser Support

- Chrome 74+
- Firefox 66+
- Safari 12.1+
- Edge 79+

Requires WebRTC support for video calling features.

## Requirements

- Modern browser with ES6+ support
- WebRTC support (for video calling)
- HTTPS (for production, required by getUserMedia API)

## Development

### Project Structure

```
client/
├── src/                      # Source code
├── examples/                 # Example implementations
│   ├── vanilla/             # Vanilla JS example
│   └── react/               # React example
├── docs/                     # Documentation
└── package.json
```

### Running Examples Locally

**Vanilla JavaScript:**
```bash
cd examples/vanilla
python3 -m http.server 8080
# Open http://localhost:8080
```

**React:**
```bash
cd examples/react
npm install
npm run dev
# Open http://localhost:3000
```

### Prerequisites

Make sure the WebVox server is running:

```bash
# From webvox root directory
npm run docker:up
npm run dev
```

## API Overview

### WebvoxClient

```javascript
const client = new WebvoxClient(config)
await client.connect()
client.disconnect()
await client.reconnect()
client.getSocket()
```

### AuthManager

```javascript
await client.auth.register(email, password)
await client.auth.login(email, password)
await client.auth.logout()
await client.auth.getUser()
client.auth.getToken()
client.auth.isAuthenticated()
client.auth.getCurrentUser()
```

### SFUManager

```javascript
await client.sfu.connect()
client.sfu.disconnect()
await client.sfu.joinRoom(roomId, participantId)
await client.sfu.leaveRoom()
await client.sfu.getRouterCapabilities(roomId)
await client.sfu.setRtpCapabilities(caps)
await client.sfu.createTransport(direction)
await client.sfu.connectTransport(id, dtlsParams)
await client.sfu.createProducer(transportId, kind, rtpParams)
await client.sfu.createConsumer(transportId, producerId, rtpCaps)
await client.sfu.pauseProducer(producerId)
await client.sfu.resumeProducer(producerId)
await client.sfu.closeProducer(producerId)
client.sfu.setAudioState(muted)
client.sfu.getCurrentRoom()
```

For detailed API documentation, see [API Reference](./docs/API.md).

## Roadmap

- [ ] TypeScript type definitions
- [ ] Screen sharing support
- [ ] Recording capabilities
- [ ] STT (Speech-to-Text) integration
- [ ] TTS (Text-to-Speech) integration
- [ ] Usage tracking integration
- [ ] Publish to npm
- [ ] Add tests
- [ ] Add chat functionality
- [ ] Add file sharing

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Support

For issues and questions:
- Check the [Integration Guide](./docs/INTEGRATION.md)
- Check the [Troubleshooting](./docs/INTEGRATION.md#troubleshooting) section
- Open an issue on GitHub

## Related

- [WebVox Server](../) - The WebVox server application
- [mediasoup](https://mediasoup.org/) - WebRTC SFU library
- [Socket.IO](https://socket.io/) - Real-time communication

---

Built with ❤️ for real-time video communication

# WebVox Vanilla JavaScript Example

This example demonstrates how to integrate the WebVox Client SDK into a vanilla JavaScript application.

## Features

- User authentication (login/register)
- Video calling with SFU (Selective Forwarding Unit)
- Real-time audio/video streaming
- Mute/unmute controls
- Video on/off controls
- Multi-participant support

## Prerequisites

- Node.js and npm installed
- WebVox server running at `http://localhost:4000`
- Modern web browser with WebRTC support

## Setup

1. Make sure the WebVox server is running:

```bash
# From the webvox root directory
npm run docker:up
npm run dev
```

2. Install the client SDK dependencies:

```bash
# From the client directory
cd client
npm install
```

3. Serve the example using a local HTTP server (required for ES modules):

```bash
# Option 1: Using Python
python3 -m http.server 8080

# Option 2: Using Node.js http-server (install globally first)
npm install -g http-server
http-server -p 8080

# Option 3: Using VS Code Live Server extension
# Right-click index.html and select "Open with Live Server"
```

4. Open your browser and navigate to:

```
http://localhost:8080/examples/vanilla/
```

## Usage

### Authentication

1. Enter your email and password
2. Click "Register" to create a new account or "Login" to sign in
3. Upon successful authentication, you'll see the video call interface

### Joining a Room

1. Enter a room ID (e.g., "test-room")
2. Click "Join Room"
3. Allow camera and microphone access when prompted
4. You'll see your local video feed
5. Other participants will appear as they join the same room

### Controls

- **Mute/Unmute**: Toggle your microphone
- **Stop/Start Video**: Toggle your camera
- **Leave Room**: Exit the current room
- **Logout**: Sign out and return to login screen

## Code Structure

- `index.html` - Main HTML file with UI structure and styling
- `app.js` - Application logic using WebVox Client SDK
  - Authentication handling
  - Room management
  - WebRTC media setup
  - UI updates and event handling

## Key Concepts

### Initializing the Client

```javascript
import { WebvoxClient } from '../../src/index.js';

const client = new WebvoxClient({
  serverUrl: 'http://localhost:4000',
  autoConnect: false,
});
```

### Authentication

```javascript
// Login
await client.auth.login(email, password);
await client.connect();

// Register
await client.auth.register(email, password);
await client.connect();

// Logout
await client.auth.logout();
client.disconnect();
```

### Joining a Video Call

```javascript
// Connect to SFU
await client.sfu.connect();

// Join room
const userId = client.auth.getCurrentUser().id;
await client.sfu.joinRoom(roomId, userId);

// Setup mediasoup device
const device = new mediasoupClient.Device();
const routerCaps = await client.sfu.getRouterCapabilities();
await device.load({ routerRtpCapabilities: routerCaps.rtpCapabilities });

// Create transports and producers for local media
// See app.js for complete implementation
```

### Handling Events

```javascript
// Listen for new participants
client.sfu.on('participant-joined', (data) => {
  console.log('Participant joined:', data);
});

// Listen for new producers (remote media)
client.sfu.on('new-producer', async (data) => {
  await consumeTrack(data.producerId);
});

// Listen for participants leaving
client.sfu.on('participant-left', (data) => {
  console.log('Participant left:', data);
});
```

## Troubleshooting

### Camera/Microphone Not Working

- Ensure your browser has permission to access camera and microphone
- Check that no other application is using your camera
- Try refreshing the page and allowing permissions again

### Connection Issues

- Verify the WebVox server is running at `http://localhost:4000`
- Check browser console for error messages
- Ensure you're serving the files over HTTP (not file://)

### Video Not Showing

- Check that WebRTC is supported in your browser
- Verify the SFU server (mediasoup) is running properly
- Look for errors in both browser and server console

## Browser Support

- Chrome 74+
- Firefox 66+
- Safari 12.1+
- Edge 79+

## Next Steps

- Check out the [React example](../react/) for a framework-based implementation
- Read the [Integration Guide](../../docs/INTEGRATION.md) for more details
- Explore the [API documentation](../../docs/API.md) for advanced usage

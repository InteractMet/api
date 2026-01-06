# WebVox React Integration Example

This example shows how to integrate WebVox services (video calling, speech-to-text, and text-to-speech) into your React application.

## What is WebVox?

WebVox is a unified gateway server that provides:
- **Video/Audio Calling**: Multi-party WebRTC video conferencing
- **Speech-to-Text**: Real-time transcription of spoken words
- **Text-to-Speech**: Convert text to natural-sounding speech

Your application connects to a WebVox server using an API key, and WebVox handles all the complexity of video streaming, transcription, and speech synthesis.

## Prerequisites

- **Node.js 18+** installed
- **A WebVox API key** (contact your WebVox service provider)
- **WebVox server URL** (e.g., `https://webvox.yourprovider.com`)
- **Modern browser** with WebRTC support (Chrome, Firefox, Edge, or Safari)

## Quick Start

### 1. Install Dependencies

```bash
npm install socket.io-client mediasoup-client
```

### 2. Connect to WebVox

```jsx
import { io } from 'socket.io-client';

const socket = io('https://webvox.yourprovider.com', {
  auth: {
    apiKey: 'wvx_your_api_key_here'
  }
});

socket.on('connect', () => {
  console.log('Connected to WebVox!');
});

socket.on('connect_error', (error) => {
  console.error('Connection failed:', error.message);
});
```

### 3. Run the Example

```bash
# Clone or download this example
cd client/examples/react

# Install dependencies
npm install

# Start the development server
npm run dev

# Open http://localhost:3001 in your browser
```

## How to Integrate WebVox

### Step 1: Create the WebVox Hook

Create a custom hook to manage the WebVox connection:

```jsx
// hooks/useWebvox.js
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export function useWebvox({ serverUrl, apiKey }) {
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!apiKey) return;

    // Connect to WebVox server
    socketRef.current = io(serverUrl, {
      auth: { apiKey }
    });

    socketRef.current.on('connect', () => {
      setIsConnected(true);
      setError(null);
    });

    socketRef.current.on('connect_error', (err) => {
      setError(err.message);
      setIsConnected(false);
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [serverUrl, apiKey]);

  return {
    socket: socketRef.current,
    isConnected,
    error
  };
}
```

### Step 2: Use the Hook in Your App

```jsx
// App.jsx
import { useWebvox } from './hooks/useWebvox';

function App() {
  const { socket, isConnected, error } = useWebvox({
    serverUrl: 'https://webvox.yourprovider.com',
    apiKey: 'wvx_your_api_key_here' // In production, use env variables
  });

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!isConnected) {
    return <div>Connecting to WebVox...</div>;
  }

  return (
    <div>
      <h1>Connected to WebVox ✅</h1>
      <VideoCall socket={socket} />
    </div>
  );
}
```

## Video Calling Integration

### Full Video Call Example

```jsx
import { useState, useEffect, useRef } from 'react';
import mediasoupClient from 'mediasoup-client';

function VideoCall({ socket }) {
  const [device, setDevice] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remotePeers, setRemotePeers] = useState(new Map());
  const sendTransportRef = useRef(null);
  const recvTransportRef = useRef(null);

  const joinRoom = async (roomId) => {
    try {
      // 1. Connect to SFU (video service)
      await new Promise((resolve, reject) => {
        socket.emit('connect-sfu', (response) => {
          response.success ? resolve() : reject(new Error(response.error));
        });
      });

      // 2. Join the room
      socket.emit('join-room', {
        roomId: roomId,
        participantId: 'user_' + Math.random().toString(36).substr(2, 9)
      });

      // 3. Get router capabilities
      const routerCapabilities = await new Promise((resolve) => {
        socket.emit('get-router-capabilities', {}, resolve);
      });

      // 4. Create mediasoup device
      const newDevice = new mediasoupClient.Device();
      await newDevice.load({ routerRtpCapabilities: routerCapabilities.routerRtpCapabilities });
      setDevice(newDevice);

      // 5. Send RTP capabilities to server
      socket.emit('set-rtp-capabilities', {
        rtpCapabilities: newDevice.rtpCapabilities
      });

      // 6. Create send transport (for sending your video/audio)
      const sendTransportData = await new Promise((resolve) => {
        socket.emit('create-transport', { direction: 'send' }, resolve);
      });

      const sendTransport = newDevice.createSendTransport(sendTransportData.transportOptions);

      sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        socket.emit('connect-transport', {
          transportId: sendTransport.id,
          dtlsParameters
        }, (response) => {
          response.error ? errback(new Error(response.error)) : callback();
        });
      });

      sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
        socket.emit('create-producer', {
          transportId: sendTransport.id,
          kind,
          rtpParameters,
          appData
        }, (response) => {
          response.error ? errback(new Error(response.error)) : callback({ id: response.producerId });
        });
      });

      sendTransportRef.current = sendTransport;

      // 7. Create receive transport (for receiving remote video/audio)
      const recvTransportData = await new Promise((resolve) => {
        socket.emit('create-transport', { direction: 'recv' }, resolve);
      });

      const recvTransport = newDevice.createRecvTransport(recvTransportData.transportOptions);

      recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        socket.emit('connect-transport', {
          transportId: recvTransport.id,
          dtlsParameters
        }, (response) => {
          response.error ? errback(new Error(response.error)) : callback();
        });
      });

      recvTransportRef.current = recvTransport;

      // 8. Get local media (camera and microphone)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      setLocalStream(stream);

      // 9. Produce local media
      for (const track of stream.getTracks()) {
        await sendTransport.produce({ track });
      }

      // 10. Listen for new participants
      socket.on('new-producer', async ({ producerId, participantId, kind }) => {
        await consumeRemoteStream(producerId, participantId, kind);
      });

    } catch (error) {
      console.error('Failed to join room:', error);
    }
  };

  const consumeRemoteStream = async (producerId, participantId, kind) => {
    const response = await new Promise((resolve) => {
      socket.emit('create-consumer', {
        transportId: recvTransportRef.current.id,
        producerId
      }, resolve);
    });

    const consumer = await recvTransportRef.current.consume({
      id: response.consumerId,
      producerId: response.producerId,
      kind: response.kind,
      rtpParameters: response.rtpParameters
    });

    // Add remote track to UI
    setRemotePeers((prev) => {
      const updated = new Map(prev);
      if (!updated.has(participantId)) {
        updated.set(participantId, new MediaStream());
      }
      updated.get(participantId).addTrack(consumer.track);
      return updated;
    });

    socket.emit('resume-consumer', { consumerId: consumer.id });
  };

  const leaveRoom = () => {
    socket.emit('leave-room');
    localStream?.getTracks().forEach(track => track.stop());
    setLocalStream(null);
    setRemotePeers(new Map());
  };

  return (
    <div>
      <button onClick={() => joinRoom('my-room')}>Join Room</button>
      <button onClick={leaveRoom}>Leave Room</button>

      {/* Local video */}
      {localStream && (
        <video
          autoPlay
          muted
          playsInline
          ref={(video) => {
            if (video) video.srcObject = localStream;
          }}
          style={{ width: '300px' }}
        />
      )}

      {/* Remote videos */}
      {Array.from(remotePeers.entries()).map(([participantId, stream]) => (
        <video
          key={participantId}
          autoPlay
          playsInline
          ref={(video) => {
            if (video) video.srcObject = stream;
          }}
          style={{ width: '300px' }}
        />
      ))}
    </div>
  );
}
```

## Speech-to-Text Integration

```jsx
function SpeechToText({ socket }) {
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);

  useEffect(() => {
    socket.on('transcript', (data) => {
      setTranscript((prev) => prev + ' ' + data.text);
    });
  }, [socket]);

  const startTranscription = async () => {
    // 1. Connect to STT service
    await new Promise((resolve, reject) => {
      socket.emit('connect-stt', (response) => {
        response.success ? resolve() : reject(new Error(response.error));
      });
    });

    // 2. Start transcription session
    socket.emit('start-transcription', {
      language: 'en-US',
    });

    // 3. Get microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // 4. Record and send audio chunks
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Audio = reader.result.split(',')[1];
          socket.emit('audio-data', { data: base64Audio });
        };
        reader.readAsDataURL(event.data);
      }
    };

    mediaRecorder.start(100); // Send chunks every 100ms
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
  };

  const stopTranscription = () => {
    socket.emit('stop-transcription');
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
    setIsRecording(false);
  };

  return (
    <div>
      <button onClick={startTranscription} disabled={isRecording}>
        Start Transcription
      </button>
      <button onClick={stopTranscription} disabled={!isRecording}>
        Stop Transcription
      </button>
      <p>Transcript: {transcript}</p>
    </div>
  );
}
```

## Text-to-Speech Integration

```jsx
function TextToSpeech({ socket }) {
  const [text, setText] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    socket.on('speech-audio', (data) => {
      // Play the synthesized audio
      const audio = new Audio();
      const blob = new Blob([data.audio], { type: 'audio/mp3' });
      audio.src = URL.createObjectURL(blob);

      audio.onended = () => setIsPlaying(false);
      audio.play();
      setIsPlaying(true);
    });
  }, [socket]);

  const synthesizeSpeech = () => {
    socket.emit('synthesize-speech', {
      text: text,
      language: 'en-US',
      voice: 'en-US-Wavenet-A'
    });
  };

  return (
    <div>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter text to speak"
      />
      <button onClick={synthesizeSpeech} disabled={isPlaying}>
        Speak
      </button>
    </div>
  );
}
```

## WebVox Events Reference

### Events You Can Emit (Send to Server)

**Video Calling:**
- `connect-sfu` - Connect to video service
- `join-room` - Join a video room
- `leave-room` - Leave current room
- `get-router-capabilities` - Get WebRTC capabilities
- `set-rtp-capabilities` - Send your device capabilities
- `create-transport` - Create send/receive transport
- `connect-transport` - Connect transport with DTLS parameters
- `create-producer` - Start sending video/audio
- `create-consumer` - Start receiving remote video/audio
- `resume-consumer` - Resume a paused consumer

**Speech-to-Text:**
- `connect-stt` - Connect to transcription service
- `start-transcription` - Start transcription session
- `audio-data` - Send audio chunk (base64 encoded)
- `stop-transcription` - Stop transcription

**Text-to-Speech:**
- `synthesize-speech` - Convert text to speech

### Events You Can Listen To (Receive from Server)

**Connection:**
- `connect` - Connected to WebVox server
- `disconnect` - Disconnected from server
- `connect_error` - Connection failed

**Video Calling:**
- `participant-joined` - Someone joined your room
- `participant-left` - Someone left your room
- `new-producer` - New video/audio stream available
- `producer-closed` - Remote stream ended

**Speech-to-Text:**
- `transcript` - Transcription result received

**Text-to-Speech:**
- `speech-audio` - Synthesized audio ready

## Security Best Practices

### 1. Never Hardcode API Keys

❌ **Bad:**
```jsx
const apiKey = 'wvx_1234567890...';
```

✅ **Good:**
```jsx
const apiKey = import.meta.env.VITE_WEBVOX_API_KEY;
```

Create a `.env` file:
```bash
VITE_WEBVOX_API_KEY=wvx_your_api_key_here
VITE_WEBVOX_SERVER_URL=https://webvox.yourprovider.com
```

### 2. Use HTTPS in Production

Always use `https://` and `wss://` in production, not `http://` or `ws://`.

### 3. Handle API Key Expiration

```jsx
socket.on('connect_error', (error) => {
  if (error.message.includes('Authentication')) {
    // API key invalid or expired
    // Redirect to login or show error
  }
});
```

## Troubleshooting

### "Authentication failed"
- **Cause**: Invalid or expired API key
- **Solution**: Check your API key with your WebVox provider

### Camera/Microphone Permission Denied
- **Cause**: Browser blocked media access
- **Solution**: Enable permissions in browser settings, use HTTPS

### No Video/Audio Received
- **Cause**: Firewall blocking WebRTC ports
- **Solution**: Ensure UDP ports are open, check STUN/TURN configuration

### Transcription Not Working
- **Cause**: STT service not available or audio format issue
- **Solution**: Verify STT service is enabled for your API key

## Browser Support

- Chrome 74+
- Firefox 66+
- Safari 12.1+
- Edge 79+

## Production Checklist

- [ ] Store API key in environment variables
- [ ] Use HTTPS for WebVox server connection
- [ ] Handle connection errors gracefully
- [ ] Add loading states for all async operations
- [ ] Implement reconnection logic
- [ ] Test on multiple browsers and devices
- [ ] Monitor usage and costs
- [ ] Implement error boundaries

## Need Help?

- Contact your WebVox service provider for API keys and support
- Check the browser console for detailed error messages
- Test with the provided example app first before integrating

---

**Note**: This example assumes you have access to a WebVox server and a valid API key. Contact your WebVox service provider to get started.

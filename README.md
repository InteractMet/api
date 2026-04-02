# Webvox API — Simple Guide

Think of **webvox** as a magic telephone switchboard. Your app talks to webvox, and webvox talks to all the other services (video calls, speech, voice, translation) for you. You only need to know how to talk to webvox.

---

## Before Anything — Get Your Key

Every request needs an **API key**. Think of it like a password badge that lets you through the door.

You get this key from the admin panel. It looks like:

```
wvx_live_abc123...
```

---

## Step 1 — Connect

Install socket.io if you haven't:

```bash
npm install socket.io-client
```

Then connect:

```js
import { io } from 'socket.io-client'

const socket = io('https://webvox.interactmet.ca', {
  auth: { apiKey: 'YOUR_API_KEY_HERE' }
})

socket.on('connect', () => {
  console.log('Connected!')
})

socket.on('connect_error', (err) => {
  console.log('Could not connect:', err.message)
})
```

That's it. You're in. Now you can use any feature below.

---

## Feature 1 — Video & Audio Calls

### Join a room

```js
// First, connect to the video system
socket.emit('connect-sfu', (res) => {
  if (res.success) {
    // Now join a room
    socket.emit('join-room', { roomId: 'my-room-123' })
  }
})
```

### Leave a room

```js
socket.emit('leave-room')
```

> **What is SFU?** It's the thing that handles video and audio between multiple people in a call. You don't need to understand it — just call `connect-sfu` first, then `join-room`.

---

## Feature 2 — Speech to Text (Google, streaming)

Turn someone's voice into text, word by word, as they speak.

```js
// Step 1: Connect to speech service
socket.emit('connect-stt', (res) => {
  if (res.success) {

    // Step 2: Start listening
    socket.emit('start-transcription', {
      language: 'en-US',  // what language they're speaking
      model: 'chirp'
    })

    // Step 3: Send audio chunks (you get these from the microphone)
    socket.emit('audio-data', { data: base64AudioChunk })

    // Step 4: Stop when done
    socket.emit('stop-transcription')
  }
})

// Step 5: Receive the words
socket.on('transcript', ({ text, isFinal }) => {
  if (isFinal) {
    console.log('They said:', text)
  }
})
```

---

## Feature 3 — Speech to Text (Whisper, one chunk at a time)

Good for short recordings. Send a recorded audio file, get the text back.

```js
socket.emit('whisper-transcribe', {
  audio: audioBuffer,      // your recorded audio (Buffer or ArrayBuffer)
  language: 'en',          // optional, auto-detects if not set
  chunkSeconds: 5          // how many seconds of audio this is
}, (res) => {
  if (res.success) {
    console.log('They said:', res.text)
  } else {
    console.log('Error:', res.error)
  }
})
```

---

## Feature 4 — Text to Speech (make the computer talk)

Give it text, it gives you back audio that you can play.

### Option A — Streaming (audio comes back piece by piece, starts playing faster)

```js
socket.emit('synthesize-speech', {
  text: 'Hello! How are you today?',
  voice: 'alloy',    // see voices list below
  model: 'tts-1',
  speed: 1.0         // 0.25 (slow) to 4.0 (fast)
}, (ack) => {
  // ack tells you the request was received
})

// Audio arrives in chunks — collect them
const chunks = []

socket.on('speech-audio-chunk', (chunk) => {
  chunks.push(chunk)
})

socket.on('speech-audio-end', () => {
  // All done — play the audio
  const blob = new Blob(chunks, { type: 'audio/mpeg' })
  const url = URL.createObjectURL(blob)
  new Audio(url).play()
})

socket.on('speech-audio-error', ({ error }) => {
  console.log('TTS failed:', error)
})
```

### Option B — HTTP (simpler, whole file at once)

```js
const response = await fetch('https://webvox.interactmet.ca/api/tts/speak', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'YOUR_API_KEY_HERE'
  },
  body: JSON.stringify({
    text: 'Hello! How are you today?',
    voice: 'alloy',
    model: 'tts-1'
  })
})

const blob = await response.blob()
const url = URL.createObjectURL(blob)
new Audio(url).play()
```

### Available Voices

| Voice | Sounds like |
|-------|-------------|
| `alloy` | Neutral, balanced |
| `echo` | Warm |
| `fable` | Storyteller |
| `onyx` | Deep, serious |
| `nova` | Energetic |
| `shimmer` | Soft, gentle |

### Available Models

| Model | When to use |
|-------|-------------|
| `tts-1` | Faster, cheaper — good for most cases |
| `tts-1-hd` | Slower, better quality |

---

## Feature 5 — Translation

Translate text from one language to another.

```js
socket.emit('translate', {
  text: 'Hello, how are you?',
  targetLanguage: 'es',       // language to translate TO
  sourceLanguage: 'en'        // language to translate FROM (optional — auto-detects)
}, (res) => {
  if (res.success) {
    console.log('Translated:', res.translatedText)  // "Hola, ¿cómo estás?"
    console.log('Characters used:', res.charCount)
  }
})
```

**Response fields:**

```js
{
  success: true,
  translatedText: 'Hola, ¿cómo estás?',
  detectedSourceLanguage: 'en',
  charCount: 20,
  cost: 0.16    // in USD cents, roughly
}
```

---

## Full React Example

Here's a small React component that connects and translates text:

```jsx
import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

const socket = io('https://webvox.interactmet.ca', {
  auth: { apiKey: 'YOUR_API_KEY_HERE' }
})

export default function Translator() {
  const [connected, setConnected] = useState(false)
  const [result, setResult] = useState('')

  useEffect(() => {
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    return () => socket.disconnect()
  }, [])

  function translate() {
    socket.emit('translate', {
      text: 'Hello world',
      targetLanguage: 'es'
    }, (res) => {
      if (res.success) setResult(res.translatedText)
    })
  }

  return (
    <div>
      <p>Status: {connected ? 'Connected' : 'Not connected'}</p>
      <button onClick={translate}>Translate "Hello world" to Spanish</button>
      {result && <p>Result: {result}</p>}
    </div>
  )
}
```

---

## Quick Reference

| What you want to do | What to call |
|---|---|
| Join a video/audio call | `connect-sfu` → `join-room` |
| Start live transcription | `connect-stt` → `start-transcription` |
| Transcribe a recording | `whisper-transcribe` |
| Make the computer speak (socket) | `synthesize-speech` |
| Make the computer speak (HTTP) | `POST /api/tts/speak` |
| Translate text | `translate` |
| Get available voices | `get-tts-voices` |
| Get available TTS models | `get-tts-models` |
| Check server is alive | `GET /health` |

---

## Common Mistakes

**"Authentication failed"**
→ You forgot to pass `auth: { apiKey: '...' }` when connecting.

**"Origin not allowed"**
→ Your website's address isn't in the allowed list for your API key. Ask the admin to add it.

**"Service not available"**
→ That feature isn't set up on the server yet (missing API key on the server side).

**Audio doesn't play**
→ Browsers block audio that wasn't triggered by a user click. Make sure `new Audio().play()` runs inside a button click handler.

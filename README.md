# Webvox API

**Webvox** is a unified gateway for real-time communication. Your app connects to webvox via Socket.IO and gets access to video/audio calls, speech-to-text, text-to-speech, and translation — all through a single connection.

---

## Get Your API Key

Every connection requires an API key. Get one from your admin panel. It looks like:

```
wvx_live_abc123...
```

---

## Connect

```bash
npm install socket.io-client
```

```js
import { io } from 'socket.io-client'

const socket = io('https://webvox.interactmet.ca', {
  auth: { apiKey: 'YOUR_API_KEY_HERE' }
})

socket.on('connect', () => console.log('Connected'))
socket.on('connect_error', (err) => console.log('Failed:', err.message))
```

---

## Feature 1 — Video & Audio Calls

```js
// Connect to video system
socket.emit('connect-sfu', (res) => {
  if (res.success) {
    // Join a room
    socket.emit('join-room', { roomId: 'my-room-123' })
  }
})

// Leave
socket.emit('leave-room')
```

---

## Feature 2 — Speech to Text (streaming)

Real-time transcription as the user speaks.

```js
// Connect to STT service
socket.emit('connect-stt', (res) => {
  if (res.success) {

    // Start
    socket.emit('start-transcription', {
      language: 'en-US',
      model: 'chirp'
    })

    // Send audio chunks from microphone
    socket.emit('audio-data', { data: base64AudioChunk })

    // Stop
    socket.emit('stop-transcription')
  }
})

// Receive transcript
socket.on('transcript', ({ text, isFinal }) => {
  if (isFinal) console.log('Transcript:', text)
})
```

---

## Feature 3 — Speech to Text (Whisper, single recording)

Send a recorded audio file, get the text back.

```js
socket.emit('whisper-transcribe', {
  audio: audioBuffer,   // Buffer or ArrayBuffer
  language: 'en',       // optional — auto-detects if not set
  chunkSeconds: 5
}, (res) => {
  if (res.success) console.log('Transcript:', res.text)
  else console.log('Error:', res.error)
})
```

---

## Feature 4 — Text to Speech

Powered by **Google Cloud Chirp3-HD**. Supports **46 languages**.

Pass a `language` code to get the correct voice for that language. If omitted, defaults to English.

```js
socket.emit('synthesize-speech', {
  text: 'Hello, how are you?',
  language: 'en',   // language code — determines the voice used
  speed: 1.0        // optional, 0.25–4.0
}, (ack) => {
  // ack confirms the request was received
})

// Collect audio chunks
const chunks = []

socket.on('speech-audio-chunk', async (chunk) => {
  // In production browsers, chunk may arrive as a Blob
  if (chunk instanceof Blob) {
    chunks.push(new Uint8Array(await chunk.arrayBuffer()))
  } else if (chunk instanceof ArrayBuffer) {
    chunks.push(new Uint8Array(chunk))
  } else if (chunk?.type === 'Buffer') {
    chunks.push(new Uint8Array(chunk.data))
  } else {
    chunks.push(chunk)
  }
})

socket.on('speech-audio-end', () => {
  const blob = new Blob(chunks, { type: 'audio/mpeg' })
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.play()
  audio.onended = () => URL.revokeObjectURL(url)
})

socket.on('speech-audio-error', ({ error }) => {
  console.log('TTS failed:', error)
})
```

### Supported TTS Languages

| Code | Language | Code | Language |
|------|----------|------|----------|
| `en` | English | `ar` | Arabic |
| `fr` | French | `de` | German |
| `es` | Spanish | `hi` | Hindi |
| `ur` | Urdu | `it` | Italian |
| `ja` | Japanese | `ko` | Korean |
| `pt` | Portuguese | `ru` | Russian |
| `zh` | Chinese | `nl` | Dutch |
| `pl` | Polish | `sv` | Swedish |
| `uk` | Ukrainian | `id` | Indonesian |
| `vi` | Vietnamese | `th` | Thai |
| `bn` | Bengali | `bg` | Bulgarian |
| `hr` | Croatian | `cs` | Czech |
| `da` | Danish | `et` | Estonian |
| `fi` | Finnish | `el` | Greek |
| `gu` | Gujarati | `he` | Hebrew |
| `hu` | Hungarian | `kn` | Kannada |
| `lv` | Latvian | `lt` | Lithuanian |
| `ml` | Malayalam | `mr` | Marathi |
| `nb` | Norwegian | `pa` | Punjabi |
| `ro` | Romanian | `sr` | Serbian |
| `sk` | Slovak | `sl` | Slovenian |
| `sw` | Swahili | `ta` | Tamil |
| `te` | Telugu | `tr` | Turkish |

You can also fetch the full list at runtime:

```js
// Via socket
socket.emit('get-tts-voices', (res) => {
  console.log(res.voices) // [{ id: 'en', name: 'English (Chirp3-HD)' }, ...]
})

// Via REST
const res = await fetch('https://webvox.interactmet.ca/api/tts/voices', {
  headers: { 'x-api-key': 'YOUR_API_KEY_HERE' }
})
const { voices } = await res.json()
```

---

## Feature 5 — Translation

Powered by **OpenAI GPT-4o-mini**. Supports **91 languages**.

```js
socket.emit('translate', {
  text: 'Hello, how are you?',
  targetLanguage: 'es',    // language to translate TO
  sourceLanguage: 'en'     // language to translate FROM (optional — auto-detects)
}, (res) => {
  if (res.success) {
    console.log('Translated:', res.translatedText)       // "Hola, ¿cómo estás?"
    console.log('Detected source:', res.detectedSourceLanguage) // 'en'
  } else {
    console.log('Error:', res.error)
  }
})
```

**Response:**

```js
{
  success: true,
  translatedText: 'Hola, ¿cómo estás?',
  detectedSourceLanguage: 'en'
}
```

If `sourceLanguage` is omitted or `'auto'`, the source language is auto-detected from the text's script/content.

---

## Quick Reference

| What you want | Event / Endpoint |
|---|---|
| Connect to video calls | `connect-sfu` → `join-room` |
| Leave a video call | `leave-room` |
| Start live transcription | `connect-stt` → `start-transcription` |
| Send audio for transcription | `audio-data` |
| Stop transcription | `stop-transcription` |
| Transcribe a recording | `whisper-transcribe` |
| Text to speech | `synthesize-speech` |
| Get available TTS languages | `get-tts-voices` or `GET /api/tts/voices` |
| Translate text | `translate` |
| Health check | `GET /health` |

---

## Common Errors

**"Authentication failed"**
Your API key is missing or wrong. Pass `auth: { apiKey: '...' }` when connecting. Make sure the key exists in the system.

**"Service not available"**
The server is missing a required configuration (e.g. the application API URL is not set). Contact your admin.

**Audio doesn't play**
Browsers block audio that wasn't triggered by a user interaction. Call `audio.play()` inside a button click handler, or use a user gesture to unlock audio first.

**Translation returns HTML instead of JSON**
The application server URL is misconfigured on the webvox server. Admin needs to check `APP_API_URL` in the webvox environment.

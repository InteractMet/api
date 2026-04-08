import { useState, useEffect, useRef } from 'react';
import { logger } from '../utils/logger';

export function SpeechToText({ client }) {
  // STT state
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [sttError, setSttError] = useState(null);
  const recognitionRef = useRef(null);

  // TTS state
  const [ttsText, setTtsText] = useState('');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [ttsError, setTtsError] = useState(null);
  const audioElRef = useRef(null);
  const chunkQueueRef = useRef([]);
  const ttsDebounceRef = useRef(null);
  const lastSynthesizedRef = useRef('');

  // Auto-start listening when component mounts
  useEffect(() => {
    startListening();
    return () => stopListening();
  }, []);

  // OGG/Opus streaming player using MediaSource API
  useEffect(() => {
    if (!client?.socket) return;

    const MIME = 'audio/ogg; codecs="opus"';
    const canStream = typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(MIME) && false;

    const toUint8Array = async (data) => {
      if (data instanceof Uint8Array) return data;
      if (data instanceof ArrayBuffer) return new Uint8Array(data);
      if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
      if (data?.type === 'Buffer' && Array.isArray(data.data)) return new Uint8Array(data.data);
      return new Uint8Array(Object.values(data));
    };

    // ── Streaming path (MediaSource) ──────────────────────────────────────────
    let ms = null;
    let sb = null;
    const appendQueue = [];
    let appending = false;
    let endPending = false;

    const tryFlush = () => {
      if (appending || !sb || sb.updating) return;
      if (appendQueue.length > 0) {
        appending = true;
        try { sb.appendBuffer(appendQueue.shift()); } catch (e) { appending = false; }
        return;
      }
      if (endPending && ms?.readyState === 'open') {
        try { ms.endOfStream(); } catch (_) {}
        endPending = false;
      }
    };

    const initMS = () => {
      ms = new MediaSource();
      mediaSourceRef.current = ms;
      const audio = new Audio();
      audioElRef.current = audio;
      audio.src = URL.createObjectURL(ms);
      ms.addEventListener('sourceopen', () => {
        sb = ms.addSourceBuffer(MIME);
        sb.addEventListener('updateend', () => { appending = false; tryFlush(); });
        audio.play().catch((e) => logger.error('Audio play error:', e));
        tryFlush();
      });
    };

    // ── Fallback path (collect → blob) ────────────────────────────────────────
    const handleChunk = async (data) => {
      const chunk = await toUint8Array(data);
      if (canStream) {
        if (!ms) initMS();
        appendQueue.push(chunk);
        tryFlush();
      } else {
        chunkQueueRef.current.push(chunk);
      }
    };

    const handleEnd = () => {
      setIsSynthesizing(false);
      if (canStream) {
        endPending = true;
        tryFlush();
      } else {
        if (chunkQueueRef.current.length === 0) return;
        const blob = new Blob(chunkQueueRef.current, { type: 'audio/mpeg' });
        chunkQueueRef.current = [];
        if (audioElRef.current) { URL.revokeObjectURL(audioElRef.current.src); audioElRef.current.pause(); }
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioElRef.current = audio;
        audio.play().catch((e) => logger.error('Audio play error:', e));
        audio.onended = () => URL.revokeObjectURL(url);
      }
    };

    const handleError = ({ error }) => {
      setTtsError(error || 'Synthesis failed');
      setIsSynthesizing(false);
      chunkQueueRef.current = [];
      appendQueue.length = 0;
    };

    client.socket.on('speech-audio-chunk', handleChunk);
    client.socket.on('speech-audio-end', handleEnd);
    client.socket.on('speech-audio-error', handleError);

    return () => {
      client.socket.off('speech-audio-chunk', handleChunk);
      client.socket.off('speech-audio-end', handleEnd);
      client.socket.off('speech-audio-error', handleError);
    };
  }, [client]);

  const CHUNK_INTERVAL_MS = 3000;
  // RMS threshold — chunks below this are considered silence and skipped
  const SILENCE_THRESHOLD = 0.01;

  const getAudioRMS = async (blob) => {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioCtx = new AudioContext();
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);
      const data = decoded.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      audioCtx.close();
      return Math.sqrt(sum / data.length);
    } catch {
      return 1; // if we can't check, assume speech
    }
  };

  const startListening = async () => {
    if (!client?.socket) { setSttError('Not connected to server.'); return; }
    setSttError(null);

    let active = true;
    let stream = null;
    let currentRecorder = null;
    recognitionRef.current = {
      stop: () => {
        active = false;
        if (currentRecorder && currentRecorder.state === 'recording') {
          currentRecorder.stop();
        }
        stream?.getTracks().forEach((t) => t.stop());
      },
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setSttError('Microphone permission denied.');
      return;
    }

    if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const recordChunk = () => {
      if (!active) return;

      const recorder = new MediaRecorder(stream, { mimeType });
      currentRecorder = recorder;
      const chunks = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      recorder.onstop = async () => {
        if (!active || chunks.length === 0) { recordChunk(); return; }

        try {
          const blob = new Blob(chunks, { type: mimeType });

          // Skip silent chunks — avoids Whisper hallucinations on silence
          const rms = await getAudioRMS(blob);
          if (rms < SILENCE_THRESHOLD) { recordChunk(); return; }

          const arrayBuffer = await blob.arrayBuffer();
          client.socket.emit(
            'whisper-transcribe',
            { audio: arrayBuffer, language: 'en', chunkSeconds: CHUNK_INTERVAL_MS / 1000 },
            (response) => {
              if (response?.success && response.text) {
                setFinalTranscript((prev) => (prev ? prev + ' ' + response.text : response.text));
              }
            }
          );
        } catch (err) {
          setSttError('Failed to send audio: ' + err.message);
        }

        recordChunk();
      };

      recorder.start();
      setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, CHUNK_INTERVAL_MS);
    };

    recordChunk();
    setIsListening(true);
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript('');
  };

  const clearTranscript = () => {
    setFinalTranscript('');
    setInterimTranscript('');
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(finalTranscript);
    } catch {
      setSttError('Failed to copy');
    }
  };

  // Live TTS — synthesize only newly added text 800ms after user stops typing
  useEffect(() => {
    const newText = ttsText.trim();

    if (!newText) {
      lastSynthesizedRef.current = '';
      return;
    }

    clearTimeout(ttsDebounceRef.current);
    ttsDebounceRef.current = setTimeout(() => {
      const last = lastSynthesizedRef.current;

      // If user appended text, speak only the new portion; otherwise speak full text (edit/delete case)
      const textToSpeak = newText.startsWith(last)
        ? newText.slice(last.length).trim()
        : newText;

      if (!textToSpeak) return;

      lastSynthesizedRef.current = newText;
      setIsSynthesizing(true);
      setTtsError(null);

      client.socket.emit('synthesize-speech', {
        text: textToSpeak,
        voice: 'alloy',
        model: 'tts-1',
      }, (response) => {
        if (response && !response.success) {
          setTtsError(response.error || 'Synthesis failed');
          setIsSynthesizing(false);
        }
      });
    }, 800);

    return () => clearTimeout(ttsDebounceRef.current);
  }, [ttsText]);

  return (
    <div className="max-w-4xl mx-auto space-y-8">

      {/* ── SPEECH TO TEXT ── */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-800">Speech to Text</h2>
            {isListening && (
              <span className="flex items-center gap-1.5 text-sm text-red-600 font-medium">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block"></span>
                Listening
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {finalTranscript && (
              <>
                <button onClick={copyToClipboard} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors">
                  📋 Copy
                </button>
                <button onClick={clearTranscript} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors">
                  Clear
                </button>
              </>
            )}
            <button
              onClick={isListening ? stopListening : startListening}

              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
                isListening
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              }`}
            >
              {isListening ? '⏹ Stop' : '🎤 Start'}
            </button>
          </div>
        </div>

        {sttError && <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 rounded-lg border border-red-200">{sttError}</div>}

        <div className="bg-white border border-gray-200 rounded-lg p-6 min-h-48">
          {finalTranscript || interimTranscript ? (
            <p className="text-gray-800 leading-relaxed whitespace-pre-wrap text-lg">
              {finalTranscript}
              {interimTranscript && (
                <span className="text-gray-400 italic"> {interimTranscript}</span>
              )}
            </p>
          ) : (
            <p className="text-gray-400 italic text-center mt-12">
              {isListening ? 'Speak now...' : 'Start listening to transcribe speech'}
            </p>
          )}
        </div>
      </div>

      {/* ── DIVIDER ── */}
      <hr className="border-gray-200" />

      {/* ── TEXT TO SPEECH ── */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Text to Speech</h2>
          <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full font-medium">Speaks as you type</span>
          {isSynthesizing && <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <textarea
            value={ttsText}
            onChange={(e) => setTtsText(e.target.value)}
            placeholder="Start typing to hear it spoken..."
            rows={4}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-gray-800"
          />

          {ttsError && <div className="px-4 py-3 bg-red-50 text-red-700 rounded-lg border border-red-200">{ttsError}</div>}
        </div>
      </div>

    </div>
  );
}

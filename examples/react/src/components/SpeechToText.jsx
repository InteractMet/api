import { useState, useEffect, useRef } from 'react';
import { logger } from '../utils/logger';

export function SpeechToText({ client }) {
  const RATE = 0.66; // $ per minute

  // STT state
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [sttError, setSttError] = useState(null);
  const [sttSeconds, setSttSeconds] = useState(0);
  const recognitionRef = useRef(null);

  // TTS state
  const [ttsText, setTtsText] = useState('');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [ttsError, setTtsError] = useState(null);
  const [ttsChars, setTtsChars] = useState(0);

  const sttCost = ((sttSeconds / 60) * RATE).toFixed(4);
  const ttsCost = ((ttsChars / 750) * RATE).toFixed(4);
  const totalCost = (parseFloat(sttCost) + parseFloat(ttsCost)).toFixed(4);
  const mediaSourceRef = useRef(null);
  const sourceBufferRef = useRef(null);
  const audioElRef = useRef(null);
  const chunkQueueRef = useRef([]);
  const isAppendingRef = useRef(false);

  // Auto-start listening when component mounts
  useEffect(() => {
    startListening();
    return () => stopListening();
  }, []);

  // MP3 streaming player using MediaSource API
  useEffect(() => {
    if (!client?.socket) return;

    const appendNext = () => {
      if (
        isAppendingRef.current ||
        chunkQueueRef.current.length === 0 ||
        !sourceBufferRef.current ||
        sourceBufferRef.current.updating
      ) return;

      isAppendingRef.current = true;
      const chunk = chunkQueueRef.current.shift();
      try {
        sourceBufferRef.current.appendBuffer(chunk);
      } catch (e) {
        isAppendingRef.current = false;
        logger.error('appendBuffer error:', e);
      }
    };

    const initMediaSource = () => {
      const ms = new MediaSource();
      mediaSourceRef.current = ms;

      const audio = new Audio();
      audioElRef.current = audio;
      audio.src = URL.createObjectURL(ms);

      ms.addEventListener('sourceopen', () => {
        const sb = ms.addSourceBuffer('audio/mpeg');
        sourceBufferRef.current = sb;

        sb.addEventListener('updateend', () => {
          isAppendingRef.current = false;
          appendNext();
        });

        audio.play().catch((e) => logger.error('Audio play error:', e));
        appendNext();
      });
    };

    const toArrayBuffer = (data) => {
      if (data instanceof ArrayBuffer) return data;
      if (data instanceof Uint8Array) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      if (data?.type === 'Buffer' && Array.isArray(data.data)) return new Uint8Array(data.data).buffer;
      return new Uint8Array(Object.values(data)).buffer;
    };

    const handleChunk = (data) => {
      try {
        if (!mediaSourceRef.current) initMediaSource();
        chunkQueueRef.current.push(toArrayBuffer(data));
        appendNext();
      } catch (err) {
        logger.error('Failed to handle audio chunk:', err);
      }
    };

    const cleanup = () => {
      chunkQueueRef.current = [];
      isAppendingRef.current = false;
      if (mediaSourceRef.current?.readyState === 'open') {
        try { mediaSourceRef.current.endOfStream(); } catch (_) {}
      }
      if (audioElRef.current) {
        URL.revokeObjectURL(audioElRef.current.src);
        audioElRef.current = null;
      }
      mediaSourceRef.current = null;
      sourceBufferRef.current = null;
    };

    const handleEnd = () => {
      setIsSynthesizing(false);
      const endStream = () => {
        if (sourceBufferRef.current?.updating) {
          sourceBufferRef.current.addEventListener('updateend', endStream, { once: true });
        } else if (mediaSourceRef.current?.readyState === 'open') {
          try { mediaSourceRef.current.endOfStream(); } catch (_) {}
        }
      };
      endStream();
    };

    const handleError = ({ error }) => {
      setTtsError(error || 'Synthesis failed');
      setIsSynthesizing(false);
      cleanup();
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
                setSttSeconds((prev) => prev + (CHUNK_INTERVAL_MS / 1000));
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

  // TTS function
  const synthesizeSpeech = () => {
    if (!ttsText.trim()) return;
    setIsSynthesizing(true);
    setTtsError(null);

    client.socket.emit('synthesize-speech', {
      text: ttsText.trim(),
      voice: 'alloy',
      model: 'tts-1',
    }, (response) => {
      if (response && !response.success) {
        setTtsError(response.error || 'Synthesis failed');
        setIsSynthesizing(false);
      } else if (response?.success) {
        setTtsChars((prev) => prev + (ttsText.trim().length));
      }
    });
  };

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
        {finalTranscript && (
          <div className="mt-2 text-sm text-gray-400 text-right">
            {finalTranscript.trim().split(/\s+/).filter(w => w).length} words
          </div>
        )}
      </div>

      {/* ── USAGE & COST ── */}
      {(sttSeconds > 0 || ttsChars > 0) && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-600 mb-3">Usage & Cost (@${RATE}/min)</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-gray-500 mb-1">STT</div>
              <div className="text-sm font-medium text-gray-800">{(sttSeconds / 60).toFixed(2)} min</div>
              <div className="text-sm font-semibold text-blue-600">${sttCost}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">TTS</div>
              <div className="text-sm font-medium text-gray-800">{ttsChars} chars</div>
              <div className="text-sm font-semibold text-purple-600">${ttsCost}</div>
            </div>
            <div className="border-l border-gray-200">
              <div className="text-xs text-gray-500 mb-1">Total</div>
              <div className="text-sm font-medium text-gray-800">&nbsp;</div>
              <div className="text-base font-bold text-green-600">${totalCost}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── DIVIDER ── */}
      <hr className="border-gray-200" />

      {/* ── TEXT TO SPEECH ── */}
      <div>
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Text to Speech</h2>

        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Enter text to synthesize</label>
            <textarea
              value={ttsText}
              onChange={(e) => setTtsText(e.target.value)}
              placeholder="Type something to convert to speech..."
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-800"
            />
            <div className="mt-1 text-sm text-gray-400 text-right">{ttsText.length} characters</div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={synthesizeSpeech}
              disabled={isSynthesizing || !ttsText.trim()}
              className="px-6 py-3 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSynthesizing ? 'Synthesizing...' : '🔊 Synthesize Speech'}
            </button>
            {ttsText && (
              <button
                onClick={() => setTtsText('')}
                className="px-6 py-3 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          {ttsError && <div className="px-4 py-3 bg-red-50 text-red-700 rounded-lg border border-red-200">{ttsError}</div>}

          {isSynthesizing && (
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-purple-500 animate-pulse flex-shrink-0"></span>
              <span className="text-purple-700 font-medium">Streaming audio...</span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

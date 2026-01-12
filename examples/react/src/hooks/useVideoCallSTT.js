import { useState, useEffect, useRef } from 'react';
import { logger } from '../utils/logger';

/**
 * Custom hook for Speech-to-Text functionality during video calls
 * Processes audio from the existing media stream instead of creating a new one
 */
export function useVideoCallSTT(client, localStreamRef, autoStart = false) {
  const [transcript, setTranscript] = useState('');
  const [isSTTActive, setIsSTTActive] = useState(false);
  const [isSTTConnected, setIsSTTConnected] = useState(false);
  const [sttError, setSTTError] = useState(null);

  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const isProcessingRef = useRef(false);
  const autoStartAttemptedRef = useRef(false);

  // Listen for transcripts from server
  useEffect(() => {
    if (!client?.socket) return;

    const handleTranscript = (data) => {
      logger.info('Received transcript:', data);

      const text = data.text || data.transcript;
      const isFinal = data.isFinal || false;

      if (isFinal) {
        setTranscript((prev) => (prev ? prev + ' ' + text : text));
      }
    };

    client.socket.on('transcript', handleTranscript);

    return () => {
      client.socket.off('transcript', handleTranscript);
    };
  }, [client]);

  const connectToSTT = async () => {
    try {
      setSTTError(null);

      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);

        client.socket.emit('connect-stt', (response) => {
          clearTimeout(timeout);
          if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.error || 'Failed to connect to STT'));
          }
        });
      });

      setIsSTTConnected(true);
      logger.info('Connected to STT service');
      return true;
    } catch (err) {
      logger.error('Failed to connect to STT:', err);
      setSTTError(err.message);
      setIsSTTConnected(false);
      return false;
    }
  };

  const startSTT = async () => {
    try {
      // Get the actual stream from the ref
      const stream = localStreamRef?.current;

      if (!stream) {
        throw new Error('No audio stream available. Join a room first.');
      }

      if (!isSTTConnected) {
        const connected = await connectToSTT();
        if (!connected) return;
      }

      setSTTError(null);

      // Start transcription session on server
      client.socket.emit('start-transcription', {
        language: 'en-US'
      });

      logger.info('Starting STT from video call audio...');

      // Create audio context at 16kHz for STT
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });

      // Use the existing media stream from video call
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);

      // Create script processor for audio processing
      const bufferSize = 4096;
      processorRef.current = audioContextRef.current.createScriptProcessor(bufferSize, 1, 1);

      processorRef.current.onaudioprocess = (e) => {
        if (!isProcessingRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = floatTo16BitPCM(inputData);
        sendAudioChunks(pcmData);
      };

      sourceRef.current.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);

      isProcessingRef.current = true;
      setIsSTTActive(true);

      logger.info('STT started successfully');
    } catch (err) {
      logger.error('Failed to start STT:', err);
      setSTTError(err.message);
      stopSTT();
    }
  };

  const stopSTT = () => {
    try {
      isProcessingRef.current = false;

      if (client?.socket?.connected) {
        client.socket.emit('stop-transcription');
      }

      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
      }

      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      setIsSTTActive(false);
      logger.info('STT stopped');
    } catch (err) {
      logger.error('Failed to stop STT:', err);
      setSTTError(err.message);
    }
  };

  const clearTranscript = () => {
    setTranscript('');
  };

  const floatTo16BitPCM = (float32Array) => {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  };

  const sendAudioChunks = (int16Array) => {
    const buffer = new ArrayBuffer(int16Array.length * 2);
    const view = new DataView(buffer);

    for (let i = 0; i < int16Array.length; i++) {
      view.setInt16(i * 2, int16Array[i], true);
    }

    const CHUNK_SIZE = 640;
    const uint8Array = new Uint8Array(buffer);

    for (let offset = 0; offset < uint8Array.length; offset += CHUNK_SIZE) {
      const chunk = uint8Array.slice(offset, offset + CHUNK_SIZE);

      if (chunk.length === CHUNK_SIZE && client?.socket?.connected) {
        client.socket.emit('audio-data', chunk);
      }
    }
  };

  // Auto-start STT when stream becomes available
  useEffect(() => {
    if (autoStart && localStreamRef?.current && !isSTTActive && !autoStartAttemptedRef.current) {
      autoStartAttemptedRef.current = true;
      logger.info('Auto-starting STT...');
      startSTT();
    }
  }, [localStreamRef?.current, autoStart, isSTTActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isSTTActive) {
        stopSTT();
      }
    };
  }, [isSTTActive]);

  return {
    transcript,
    isSTTActive,
    isSTTConnected,
    sttError,
    startSTT,
    stopSTT,
    clearTranscript,
    setSTTError
  };
}

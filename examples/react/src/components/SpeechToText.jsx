import { useState, useEffect, useRef } from 'react';
import { logger } from '../utils/logger';
import { AudioProcessor } from '../utils/audioProcessor';

export function SpeechToText({ client }) {
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSTTConnected, setIsSTTConnected] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const audioProcessorRef = useRef(null);

  // Listen for transcripts from server
  useEffect(() => {
    if (!client?.socket) return;

    const handleTranscript = (data) => {
      logger.info('Received transcript:', data);

      // Handle both formats: { text, isFinal } and { transcript, isFinal }
      const text = data.text || data.transcript;
      const isFinal = data.isFinal || false;

      if (isFinal) {
        setTranscript((prev) => prev + ' ' + text);
      } else {
        // For interim results, you could show them differently
        // For now, we'll only append final results
      }
    };

    client.socket.on('transcript', handleTranscript);

    return () => {
      client.socket.off('transcript', handleTranscript);
    };
  }, [client]);

  const connectToSTT = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      // Connect to STT service
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
      setSuccess('Connected to Speech-to-Text service');
      logger.info('Connected to STT service');

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      logger.error('Failed to connect to STT:', err);
      setError(err.message);
      setIsSTTConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const startTranscription = async () => {
    try {
      setError(null);

      if (!isSTTConnected) {
        throw new Error('Not connected to STT service. Please connect first.');
      }

      // Start transcription session on server
      client.socket.emit('start-transcription', {
        language: 'en-US'
      });

      logger.info('Starting transcription...');

      // Create audio processor
      const onAudioChunk = (chunk) => {
        if (client.socket.connected) {
          // Send as binary buffer via Socket.IO
          // Socket.IO will handle the binary transport
          client.socket.emit('audio-data', chunk);
        }
      };

      const onError = (err) => {
        logger.error('Audio processor error:', err);
        setError('Audio processing error: ' + err.message);
        stopTranscription();
      };

      audioProcessorRef.current = new AudioProcessor(onAudioChunk, onError);
      await audioProcessorRef.current.start();

      setIsRecording(true);
      setSuccess('Recording started - speak now!');
      setTimeout(() => setSuccess(null), 3000);

      logger.info('Recording started');
    } catch (err) {
      logger.error('Failed to start transcription:', err);
      setError(err.message);

      // Cleanup on error
      if (audioProcessorRef.current) {
        audioProcessorRef.current.stop();
        audioProcessorRef.current = null;
      }
    }
  };

  const stopTranscription = () => {
    try {
      // Stop transcription session
      if (client?.socket?.connected) {
        client.socket.emit('stop-transcription');
      }

      // Stop audio processor
      if (audioProcessorRef.current) {
        audioProcessorRef.current.stop();
        audioProcessorRef.current = null;
      }

      setIsRecording(false);
      setSuccess('Recording stopped');
      setTimeout(() => setSuccess(null), 3000);
      logger.info('Recording stopped');
    } catch (err) {
      logger.error('Failed to stop transcription:', err);
      setError(err.message);
    }
  };

  const clearTranscript = () => {
    setTranscript('');
    setSuccess('Transcript cleared');
    setTimeout(() => setSuccess(null), 2000);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(transcript);
      setSuccess('Copied to clipboard!');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError('Failed to copy to clipboard');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isRecording) {
        stopTranscription();
      }
    };
  }, [isRecording]);

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Speech-to-Text (English)</h2>

      <div className="flex flex-wrap gap-3 mb-6">
        {!isSTTConnected ? (
          <button
            onClick={connectToSTT}
            disabled={isConnecting}
            className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isConnecting ? 'Connecting...' : 'Connect to STT Service'}
          </button>
        ) : (
          <>
            <button
              onClick={isRecording ? stopTranscription : startTranscription}
              className={`px-6 py-3 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isRecording
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
              disabled={!isSTTConnected}
            >
              {isRecording ? '⏹ Stop Recording' : '🎤 Start Recording'}
            </button>

            {transcript && (
              <>
                <button
                  onClick={clearTranscript}
                  className="px-6 py-3 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  disabled={isRecording}
                >
                  Clear Transcript
                </button>
                <button
                  onClick={copyToClipboard}
                  className="px-6 py-3 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-colors"
                >
                  📋 Copy to Clipboard
                </button>
              </>
            )}
          </>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 rounded-lg border border-red-200">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 px-4 py-3 bg-green-50 text-green-700 rounded-lg border border-green-200">
          {success}
        </div>
      )}

      {isSTTConnected && (
        <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center gap-3 mb-2">
            <span className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></span>
            <span className="text-gray-700 font-medium">
              {isRecording ? 'Recording in progress...' : 'Ready to record'}
            </span>
          </div>
          <div className="text-sm text-gray-500">
            Language: English (US) • Format: PCM LINEAR16 • Sample Rate: 16kHz
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Transcript:</h3>
        <div className="min-h-50 p-4 bg-gray-50 rounded-lg border border-gray-200 whitespace-pre-wrap text-gray-800">
          {transcript || (
            <span className="text-gray-400 italic">
              {isSTTConnected
                ? 'Click "Start Recording" and begin speaking...'
                : 'Connect to STT service to begin'}
            </span>
          )}
        </div>
        {transcript && (
          <div className="mt-3 text-sm text-gray-500 text-right">
            Words: {transcript.trim().split(/\s+/).filter(w => w).length}
          </div>
        )}
      </div>
    </div>
  );
}

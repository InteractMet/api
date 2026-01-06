/**
 * Audio Processor for Speech-to-Text
 * Converts microphone input to PCM LINEAR16 format (16kHz, mono, 640-byte chunks)
 * Required format for Google Cloud Speech-to-Text V2
 */

import { logger } from "./logger";

export class AudioProcessor {
  constructor(onAudioChunk, onError) {
    this.onAudioChunk = onAudioChunk;
    this.onError = onError;
    this.audioContext = null;
    this.source = null;
    this.processor = null;
    this.stream = null;
    this.isProcessing = false;
  }

  async start() {
    try {
      // Get microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000, // Request 16kHz directly
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      // Create audio context at 16kHz
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });

      this.source = this.audioContext.createMediaStreamSource(this.stream);

      // Use ScriptProcessorNode (deprecated but widely supported)
      // Buffer size: 4096 samples = 256ms at 16kHz
      const bufferSize = 4096;
      this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.isProcessing) return;

        const inputData = e.inputBuffer.getChannelData(0);

        // Convert Float32Array to Int16Array (PCM LINEAR16)
        const pcmData = this.floatTo16BitPCM(inputData);

        // Split into 640-byte chunks (320 samples)
        this.sendChunks(pcmData);
      };

      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      this.isProcessing = true;

      logger.info('[AudioProcessor] Started');
    } catch (err) {
      logger.error('[AudioProcessor] Error:', err);
      this.onError(err);
      throw err;
    }
  }

  /**
   * Convert Float32Array (-1.0 to 1.0) to Int16Array PCM
   */
  floatTo16BitPCM(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  }

  /**
   * Convert Int16Array to Buffer and split into 640-byte chunks
   */
  sendChunks(int16Array) {
    // Convert Int16Array to Buffer (2 bytes per sample)
    const buffer = new ArrayBuffer(int16Array.length * 2);
    const view = new DataView(buffer);

    for (let i = 0; i < int16Array.length; i++) {
      view.setInt16(i * 2, int16Array[i], true); // true = little-endian
    }

    // Split into 640-byte chunks (320 samples)
    const CHUNK_SIZE = 640; // bytes
    const uint8Array = new Uint8Array(buffer);

    for (let offset = 0; offset < uint8Array.length; offset += CHUNK_SIZE) {
      const chunk = uint8Array.slice(offset, offset + CHUNK_SIZE);

      // Only send full 640-byte chunks
      if (chunk.length === CHUNK_SIZE) {
        this.onAudioChunk(chunk);
      }
    }
  }

  stop() {
    this.isProcessing = false;

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }

    logger.info('[AudioProcessor] Stopped');
  }
}

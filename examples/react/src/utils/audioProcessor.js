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
      // Buffer size: 2048 samples = 128ms at 16kHz
      const bufferSize = 2048;
      this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
      this._leftover = null; // carry partial 640-byte chunks across callbacks

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
   * Convert Int16Array to Buffer and split into 640-byte chunks.
   * Leftover bytes are carried to the next callback so nothing is dropped.
   */
  sendChunks(int16Array) {
    const CHUNK_SIZE = 640; // bytes (320 samples × 2)

    // Convert Int16Array to Uint8Array (little-endian)
    const buffer = new ArrayBuffer(int16Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < int16Array.length; i++) {
      view.setInt16(i * 2, int16Array[i], true);
    }
    const incoming = new Uint8Array(buffer);

    // Prepend any leftover bytes from the previous callback
    let data = incoming;
    if (this._leftover && this._leftover.length > 0) {
      const merged = new Uint8Array(this._leftover.length + incoming.length);
      merged.set(this._leftover);
      merged.set(incoming, this._leftover.length);
      data = merged;
    }

    let offset = 0;
    while (offset + CHUNK_SIZE <= data.length) {
      this.onAudioChunk(data.slice(offset, offset + CHUNK_SIZE));
      offset += CHUNK_SIZE;
    }

    // Save remaining bytes for next callback
    this._leftover = data.slice(offset);
  }

  stop() {
    this.isProcessing = false;
    this._leftover = null;

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

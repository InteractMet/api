import { useRef } from 'react';

/**
 * Custom hook to manage local media (camera/microphone) and producers
 *
 * @param {Object} sendTransportRef - Reference to the send transport
 * @returns {Object} - { localStream, producers, getLocalMedia, cleanup }
 */
export function useLocalMedia(sendTransportRef) {
  const localStreamRef = useRef(null);
  const producersRef = useRef(new Map());

  const getLocalMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localStreamRef.current = stream;

    // Create producers
    for (const track of stream.getTracks()) {
      const producer = await sendTransportRef.current.produce({ track });
      producersRef.current.set(producer.id, producer);

      producer.on('trackended', () => {
        // Track ended
      });

      producer.on('transportclose', () => {
        // Transport closed
      });
    }

    return stream;
  };

  const cleanup = () => {
    // Stop local media
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Close producers
    for (const producer of producersRef.current.values()) {
      producer.close();
    }
    producersRef.current.clear();
  };

  return {
    localStream: localStreamRef,
    producers: producersRef,
    getLocalMedia,
    cleanup,
  };
}

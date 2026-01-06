import { useState } from 'react';

/**
 * Custom hook to manage producer controls (mute/video toggle)
 *
 * @param {Object} producersRef - Reference to producers map
 * @param {Object} sfuManager - SFU manager instance
 * @returns {Object} - { isMuted, isVideoOff, toggleMute, toggleVideo }
 */
export function useProducerControls(producersRef, sfuManager) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const toggleProducer = async (kind, currentState, setState) => {
    const producer = Array.from(producersRef.current.values()).find(
      (p) => p.kind === kind
    );
    if (!producer) return;

    if (currentState) {
      await sfuManager.resumeProducer(producer.id);
      setState(false);
    } else {
      await sfuManager.pauseProducer(producer.id);
      setState(true);
    }
  };

  const toggleMute = () => toggleProducer('audio', isMuted, setIsMuted);
  const toggleVideo = () => toggleProducer('video', isVideoOff, setIsVideoOff);

  return {
    isMuted,
    isVideoOff,
    toggleMute,
    toggleVideo,
  };
}

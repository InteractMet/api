import { useEffect } from 'react';
import { logger } from '../utils/logger';

/**
 * Custom hook to manage SFU event handlers with proper cleanup
 *
 * @param {Object} sfuManager - SFU manager instance
 * @param {Function} onNewProducer - Callback when new producer is detected
 * @param {Function} onParticipantLeft - Callback when participant leaves
 * @param {Function} onProducerClosed - Callback when producer is closed
 */
export function useSFUEventHandlers(
  sfuManager,
  onNewProducer,
  onParticipantLeft,
  onProducerClosed
) {
  useEffect(() => {
    if (!sfuManager) return;

    // Participant joined handler
    const handleParticipantJoined = (data) => {
      // Participant joined - no action needed
    };

    // Participant left handler
    const handleParticipantLeft = (data) => {
      onParticipantLeft(data.participantId);
    };

    // New producer handler
    const handleNewProducer = async (data) => {
      try {
        await onNewProducer(data.participantId, data.producerId);
      } catch (err) {
        logger.error('Failed to consume track:', err);
      }
    };

    // Producer closed handler
    const handleProducerClosed = (data) => {
      onProducerClosed(data.producerId);
    };

    // Register all event handlers
    sfuManager.on('participant-joined', handleParticipantJoined);
    sfuManager.on('participant-left', handleParticipantLeft);
    sfuManager.on('new-producer', handleNewProducer);
    sfuManager.on('producer-closed', handleProducerClosed);

    // Cleanup function to remove all event listeners
    return () => {
      sfuManager.off('participant-joined', handleParticipantJoined);
      sfuManager.off('participant-left', handleParticipantLeft);
      sfuManager.off('new-producer', handleNewProducer);
      sfuManager.off('producer-closed', handleProducerClosed);
    };
  }, [sfuManager, onNewProducer, onParticipantLeft, onProducerClosed]);
}

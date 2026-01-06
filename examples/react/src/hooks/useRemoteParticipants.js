import { useRef, useState } from 'react';
import { logger } from '../utils/logger';
import { CONFIG } from '../constants/config';

/**
 * Custom hook to manage remote participants and their media tracks
 *
 * @param {Object} client - Webvox client instance
 * @param {Object} recvTransportRef - Reference to the receive transport
 * @returns {Object} - { remoteVideos, consumers, consumeTrack, cleanup }
 */
export function useRemoteParticipants(client, recvTransportRef) {
  const [remoteVideos, setRemoteVideos] = useState([]);
  const consumersRef = useRef(new Map());

  const consumeTrack = async (participantId, producerId) => {
    try {
      // Check if receive transport exists
      if (!recvTransportRef.current) {
        throw new Error('Receive transport not available');
      }

      // Request consumer from server
      const { consumerId, rtpParameters, kind } = await client.sfu.createConsumer(
        participantId,
        producerId
      );

      // Create local consumer
      const consumer = await recvTransportRef.current.consume({
        id: consumerId,
        producerId,
        kind,
        rtpParameters,
        appData: { participantId }, // Store participantId for easier cleanup
      });

      consumersRef.current.set(producerId, { consumer, participantId });

      // Add track to participant's stream or create new stream
      setRemoteVideos((prev) => {
        const existingVideoIndex = prev.findIndex((v) => v.participantId === participantId);

        if (existingVideoIndex !== -1) {
          // Add track to existing stream
          const existingVideo = prev[existingVideoIndex];
          existingVideo.stream.addTrack(consumer.track);
          return [...prev];
        } else {
          // Create new video element
          const stream = new MediaStream([consumer.track]);
          return [
            ...prev,
            {
              id: `${participantId}-video`,
              participantId,
              stream,
              label: `Participant ${participantId.substring(0, CONFIG.PARTICIPANT_ID_DISPLAY_LENGTH)}`
            },
          ];
        }
      });
    } catch (err) {
      logger.error(`Failed to consume track from ${participantId}:`, err);
      throw err;
    }
  };

  const removeParticipant = (participantId) => {
    logger.info(`👋 Removing participant ${participantId} - closing all consumers`);

    // Close all consumers for this participant
    const consumersToClose = [];
    for (const [producerId, consumerData] of consumersRef.current.entries()) {
      if (consumerData.participantId === participantId) {
        consumersToClose.push({ producerId, consumer: consumerData.consumer });
      }
    }

    // Close each consumer AND stop its track
    for (const { producerId, consumer } of consumersToClose) {
      logger.info(`⏹️ Closing consumer ${consumer.id} for producer ${producerId}`);

      // Stop the track explicitly
      if (consumer.track) {
        consumer.track.stop();
        logger.info(`🛑 Stopped track ${consumer.track.id} (${consumer.track.kind})`);
      }

      consumer.close();
      consumersRef.current.delete(producerId);
    }

    logger.info(`✅ Closed ${consumersToClose.length} consumer(s) for participant ${participantId}`);

    // Remove video element from UI
    setRemoteVideos((prev) => {
      const filtered = prev.filter((v) => v.participantId !== participantId);
      logger.info(`✅ Removed video element for participant ${participantId}`);
      return filtered;
    });
  };

  const removeProducer = (producerId, consumers) => {
    const consumerData = consumers.get(producerId);
    if (consumerData) {
      const consumer = consumerData.consumer;

      // Stop the track first
      if (consumer.track) {
        consumer.track.stop();
        logger.info(`🛑 Stopped track ${consumer.track.id} (${consumer.track.kind})`);
      }

      // Remove track from participant's stream
      setRemoteVideos((prev) => {
        return prev.map((video) => {
          const tracks = video.stream.getTracks();
          const trackToRemove = tracks.find((t) => t.id === consumer.track.id);
          if (trackToRemove) {
            video.stream.removeTrack(trackToRemove);
          }
          return video;
        });
      });

      consumer.close();
      consumers.delete(producerId);
    }
  };

  const cleanup = () => {
    // Close consumers AND stop tracks
    for (const consumerData of consumersRef.current.values()) {
      // Stop track before closing consumer
      if (consumerData.consumer.track) {
        consumerData.consumer.track.stop();
      }
      consumerData.consumer.close();
    }
    consumersRef.current.clear();
    setRemoteVideos([]);
  };

  return {
    remoteVideos,
    consumers: consumersRef,
    consumeTrack,
    removeParticipant,
    removeProducer,
    cleanup,
  };
}

import { useState, useEffect, useRef } from 'react';
import { logger } from '../utils/logger';
import { useMediasoupSetup } from '../hooks/useMediasoupSetup';
import { useLocalMedia } from '../hooks/useLocalMedia';
import { useRemoteParticipants } from '../hooks/useRemoteParticipants';
import { useSFUEventHandlers } from '../hooks/useSFUEventHandlers';
import { useProducerControls } from '../hooks/useProducerControls';
import { CONFIG } from '../constants/config';

export function VideoCall({ client, onDisconnect }) {
  const [roomId, setRoomId] = useState(CONFIG.DEFAULT_ROOM_ID);
  const [participantId] = useState(`user-${Math.random().toString(36).substr(2, 9)}`);
  const [isInRoom, setIsInRoom] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [localVideo, setLocalVideo] = useState(null);

  // Custom hooks
  const {
    device,
    sendTransport,
    recvTransport,
    setupMediasoup,
    cleanup: cleanupMediasoup,
  } = useMediasoupSetup(client, roomId);

  const {
    localStream,
    producers,
    getLocalMedia,
    cleanup: cleanupLocalMedia,
  } = useLocalMedia(sendTransport);

  const {
    remoteVideos,
    consumers,
    consumeTrack,
    removeParticipant,
    removeProducer,
    cleanup: cleanupRemoteParticipants,
  } = useRemoteParticipants(client, recvTransport);

  const { isMuted, isVideoOff, toggleMute, toggleVideo } = useProducerControls(
    producers,
    client?.sfu
  );

  // Setup SFU event handlers
  useSFUEventHandlers(
    client?.sfu,
    consumeTrack,
    removeParticipant,
    (producerId) => removeProducer(producerId, consumers.current)
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    cleanupLocalMedia();
    cleanupRemoteParticipants();
    cleanupMediasoup();
  };

  const handleJoinRoom = async () => {
    try {
      setIsJoining(true);
      setError(null);

      // Ensure client socket is connected
      if (!client.isConnected || !client.socket || !client.socket.connected) {
        throw new Error('Not connected to server. Please reconnect.');
      }

      // Ensure SFU manager is initialized
      if (!client.sfu) {
        throw new Error('SFU not initialized. Please reconnect.');
      }

      // Create room (via REST API)
      try {
        const response = await fetch(`${client.config.serverUrl}/rooms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': client.config.apiKey
          },
          body: JSON.stringify({ roomId })
        });

        if (!response.ok && response.status !== 409) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create room');
        }
      } catch (err) {
        logger.error('Room creation error:', err);
      }

      // Connect to SFU and join room
      await client.sfu.connect();
      const joinResponse = await client.sfu.joinRoom(roomId, participantId);

      // Setup mediasoup
      await setupMediasoup();

      // Get local media
      const stream = await getLocalMedia();
      setLocalVideo({ id: 'local', participantId: 'local', stream, label: 'You' });

      // Consume existing producers from other participants
      if (joinResponse.participants && joinResponse.participants.length > 0) {
        const otherParticipants = joinResponse.participants.filter(p => p.id !== participantId);

        for (const participant of otherParticipants) {
          if (participant.producers && participant.producers.length > 0) {
            for (const producer of participant.producers) {
              try {
                await consumeTrack(participant.id, producer.id);
              } catch (err) {
                logger.error(`Failed to consume producer ${producer.id}:`, err);
              }
            }
          }
        }
      }

      setIsInRoom(true);
      setSuccess(`Joined room: ${roomId}`);
      setTimeout(() => setSuccess(null), CONFIG.SUCCESS_MESSAGE_DURATION_MS);
    } catch (err) {
      logger.error('Failed to join room:', err);
      setError(err.message);
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeaveRoom = async () => {
    try {
      await client.sfu.leaveRoom();
      client.sfu.disconnect();
      cleanup();

      setIsInRoom(false);
      setLocalVideo(null);
      setSuccess('Left room');
      setTimeout(() => setSuccess(null), CONFIG.SUCCESS_MESSAGE_DURATION_MS);
    } catch (err) {
      logger.error('Failed to leave room:', err);
      setError(err.message);
    }
  };

  // Combine local and remote videos
  const allVideos = localVideo ? [localVideo, ...remoteVideos] : remoteVideos;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-800">Participant: {participantId}</h3>
          <button
            onClick={onDisconnect}
            className="px-6 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors"
          >
            Disconnect
          </button>
        </div>

        <div>
          <h3 className="text-base font-semibold text-gray-700 mb-3">Room Controls</h3>
          <div className="flex gap-3 mb-4">
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Room ID"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              disabled={isInRoom || isJoining}
            />
            {!isInRoom ? (
              <button
                onClick={handleJoinRoom}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                disabled={isJoining}
              >
                {isJoining ? 'Joining...' : 'Join Room'}
              </button>
            ) : (
              <button
                onClick={handleLeaveRoom}
                className="px-6 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors"
              >
                Leave Room
              </button>
            )}
          </div>
          {error && (
            <div className="px-4 py-3 bg-red-50 text-red-700 rounded-lg border border-red-200 mb-4">
              {error}
            </div>
          )}
          {success && (
            <div className="px-4 py-3 bg-green-50 text-green-700 rounded-lg border border-green-200 mb-4">
              {success}
            </div>
          )}
        </div>
      </div>

      {allVideos.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {allVideos.map((video) => (
            <VideoElement key={video.id} video={video} />
          ))}
        </div>
      )}

      {isInRoom && (
        <div className="flex justify-center gap-4">
          <button
            onClick={toggleMute}
            className="px-6 py-3 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-colors"
          >
            {isMuted ? '🔇 Unmute' : '🔊 Mute'}
          </button>
          <button
            onClick={toggleVideo}
            className="px-6 py-3 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-colors"
          >
            {isVideoOff ? '📹 Start Video' : '📹 Stop Video'}
          </button>
        </div>
      )}
    </div>
  );
}

function VideoElement({ video }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && video.stream) {
      videoRef.current.srcObject = video.stream;
    }

    // Cleanup when component unmounts
    return () => {
      if (videoRef.current) {
        // Only clear srcObject, don't stop tracks
        // Tracks are owned by the parent component (useRemoteParticipants or local media)
        videoRef.current.srcObject = null;
      }
    };
  }, [video.stream]);

  return (
    <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={video.id === 'local'}
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/70 to-transparent px-3 py-2">
        <span className="text-white text-sm font-medium">{video.label}</span>
      </div>
    </div>
  );
}

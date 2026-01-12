import { useState, useEffect, useRef } from 'react';
import { logger } from '../utils/logger';
import { useMediasoupSetup } from '../hooks/useMediasoupSetup';
import { useLocalMedia } from '../hooks/useLocalMedia';
import { useRemoteParticipants } from '../hooks/useRemoteParticipants';
import { useSFUEventHandlers } from '../hooks/useSFUEventHandlers';
import { useProducerControls } from '../hooks/useProducerControls';
import { useVideoCallSTT } from '../hooks/useVideoCallSTT';
import { CONFIG } from '../constants/config';

export function VideoCallWithSTT({ client, onDisconnect }) {
  const [roomId, setRoomId] = useState(CONFIG.DEFAULT_ROOM_ID);
  const [participantId] = useState(`user-${Math.random().toString(36).substring(2, 11)}`);
  const [isInRoom, setIsInRoom] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [localVideo, setLocalVideo] = useState(null);
  const [remoteTranscripts, setRemoteTranscripts] = useState({});
  const [broadcastEnabled, setBroadcastEnabled] = useState(false);

  // Video call hooks
  const {
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

  // STT hook - auto-start enabled
  const {
    transcript,
    isSTTActive,
    isSTTConnected,
    sttError,
    startSTT,
    stopSTT,
    clearTranscript,
  } = useVideoCallSTT(client, localStream, true);

  // Setup SFU event handlers
  useSFUEventHandlers(
    client?.sfu,
    consumeTrack,
    removeParticipant,
    (producerId) => removeProducer(producerId, consumers.current)
  );

  // Handle transcription-received event from other participants
  useEffect(() => {
    if (!client?.sfu) return;

    const handleTranscriptionReceived = (data) => {
      logger.info('Transcription received from participant:', data);
      setRemoteTranscripts(prev => ({
        ...prev,
        [data.participantId]: {
          text: data.text,
          timestamp: new Date()
        }
      }));
    };

    client.sfu.on('transcription-received', handleTranscriptionReceived);

    return () => {
      client.sfu.off('transcription-received', handleTranscriptionReceived);
    };
  }, [client?.sfu]);

  // Broadcast transcript when enabled and transcript changes
  useEffect(() => {
    if (broadcastEnabled && transcript && client?.sfu && isInRoom) {
      client.sfu.broadcastTranscript(transcript, true, 'en');
    }
  }, [transcript, broadcastEnabled, client?.sfu, isInRoom]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (isSTTActive) {
      stopSTT();
    }
    cleanupLocalMedia();
    cleanupRemoteParticipants();
    cleanupMediasoup();
  };

  const handleJoinRoom = async () => {
    try {
      setIsJoining(true);
      setError(null);

      if (!client.isConnected || !client.socket || !client.socket.connected) {
        throw new Error('Not connected to server. Please reconnect.');
      }

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
      if (isSTTActive) {
        stopSTT();
      }

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

  const handleToggleSTT = async () => {
    if (isSTTActive) {
      stopSTT();
    } else {
      await startSTT();
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(transcript);
      setSuccess('Transcript copied to clipboard!');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      setError('Failed to copy to clipboard');
    }
  };

  const toggleBroadcast = () => {
    setBroadcastEnabled(!broadcastEnabled);
    setSuccess(!broadcastEnabled ? 'Broadcasting enabled - your transcript is now shared' : 'Broadcasting disabled');
    setTimeout(() => setSuccess(null), 2000);
  };

  // Combine local and remote videos
  const allVideos = localVideo ? [localVideo, ...remoteVideos] : remoteVideos;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header Section */}
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

        {/* Room Controls */}
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

          {/* Messages */}
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
          {sttError && (
            <div className="px-4 py-3 bg-orange-50 text-orange-700 rounded-lg border border-orange-200 mb-4">
              STT: {sttError}
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Video Grid */}
        <div className="lg:col-span-2">
          {allVideos.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allVideos.map((video) => (
                <VideoElement key={video.id} video={video} />
              ))}
            </div>
          )}

          {allVideos.length === 0 && isInRoom && (
            <div className="bg-gray-100 rounded-lg p-12 text-center">
              <p className="text-gray-500">No video streams available</p>
            </div>
          )}
        </div>

        {/* Transcript Panel */}
        {isInRoom && (
          <div className="lg:col-span-1">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="text-base font-semibold text-gray-800 mb-3">Live Transcript</h4>

              {/* STT Status */}
              <div className="mb-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isSTTActive ? 'bg-red-500 animate-pulse' : isSTTConnected ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                  <span className="text-sm font-medium text-gray-700">
                    {isSTTActive ? 'Recording' : isSTTConnected ? 'Ready' : 'Not Connected'}
                  </span>
                  {broadcastEnabled && (
                    <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      Broadcasting
                    </span>
                  )}
                </div>
              </div>

              {/* My Transcript */}
              <div className="mb-3">
                <div className="text-xs font-semibold text-gray-600 mb-1">My Transcript:</div>
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 max-h-40 overflow-y-auto">
                  {transcript ? (
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {transcript}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 italic">
                      {isSTTActive ? 'Listening...' : 'Your transcription will appear here'}
                    </p>
                  )}
                </div>
              </div>

              {/* Remote Transcripts */}
              {Object.keys(remoteTranscripts).length > 0 && (
                <div className="mb-3">
                  <div className="text-xs font-semibold text-gray-600 mb-1">Other Participants:</div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {Object.entries(remoteTranscripts).map(([pid, data]) => (
                      <div key={pid} className="p-2 bg-gray-50 rounded border border-gray-200">
                        <div className="text-xs font-medium text-gray-600 mb-1">
                          {pid.substring(0, 8)}...
                        </div>
                        <p className="text-sm text-gray-800">{data.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Transcript Actions */}
              <div className="flex gap-2 mb-2">
                <button
                  onClick={toggleBroadcast}
                  className={`flex-1 px-3 py-2 text-sm font-medium rounded transition-colors ${
                    broadcastEnabled
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  title={broadcastEnabled ? 'Stop broadcasting transcript' : 'Broadcast transcript to others'}
                >
                  📡 {broadcastEnabled ? 'Broadcasting' : 'Broadcast'}
                </button>
                {transcript && (
                  <>
                    <button
                      onClick={copyToClipboard}
                      className="px-3 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded hover:bg-gray-300 transition-colors"
                      title="Copy transcript"
                    >
                      📋
                    </button>
                    <button
                      onClick={clearTranscript}
                      className="px-3 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded hover:bg-gray-300 transition-colors disabled:opacity-50"
                      disabled={isSTTActive}
                      title="Clear transcript"
                    >
                      🗑️
                    </button>
                  </>
                )}
              </div>

              {transcript && (
                <div className="text-xs text-gray-500 text-right">
                  Words: {transcript.trim().split(/\s+/).filter(w => w).length}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Control Bar */}
      {isInRoom && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex justify-center gap-3 flex-wrap">
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

            <div className="border-l border-gray-300 mx-2"></div>

            <button
              onClick={handleToggleSTT}
              className={`px-6 py-3 font-medium rounded-lg transition-colors ${
                isSTTActive
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              }`}
            >
              {isSTTActive ? '⏹ Stop Transcription' : '🎤 Start Transcription'}
            </button>
          </div>
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

    return () => {
      if (videoRef.current) {
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

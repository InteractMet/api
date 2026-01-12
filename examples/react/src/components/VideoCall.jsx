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
  const [message, setMessage] = useState('');
  const [receivedMessages, setReceivedMessages] = useState([]);
  const [language, setLanguage] = useState('en');

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

  // Handle received messages from other participants
  useEffect(() => {
    if (!client?.sfu) return;

    const handleTranscriptionReceived = async (data) => {
      logger.info('Message received from participant:', data);

      const newMessage = {
        participantId: data.participantId,
        text: data.text,
        timestamp: new Date()
      };

      setReceivedMessages(prev => [...prev, newMessage]);

      // Play text-to-speech for received message
      try {
        await playTextToSpeech(data.text);
      } catch (err) {
        logger.error('Failed to play TTS:', err);
      }
    };

    client.sfu.on('transcription-received', handleTranscriptionReceived);

    return () => {
      client.sfu.off('transcription-received', handleTranscriptionReceived);
    };
  }, [client?.sfu]);

  const playTextToSpeech = async (text) => {
    try {
      const response = await fetch(`${client.config.serverUrl}api/tts/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': client.config.apiKey
        },
        body: JSON.stringify({
          text: text,
          voice: 'nova'
        })
      });

      if (!response.ok) {
        throw new Error('TTS request failed');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
      logger.info('Playing TTS audio for received message');
    } catch (err) {
      logger.error('TTS synthesis failed:', err);
      throw err;
    }
  };

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
      const joinResponse = await client.sfu.joinRoom(roomId, participantId, language);

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

      // Set language preference after joining
      if (language && language !== 'en') {
        client.sfu.changeLanguage(language);
      }

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
      setReceivedMessages([]);
      setSuccess('Left room');
      setTimeout(() => setSuccess(null), CONFIG.SUCCESS_MESSAGE_DURATION_MS);
    } catch (err) {
      logger.error('Failed to leave room:', err);
      setError(err.message);
    }
  };

  const handleSendMessage = () => {
    if (!message.trim() || !client?.sfu || !isInRoom) return;

    try {
      logger.info('Sending broadcast message:', message);
      logger.info('Current room:', client.sfu.getCurrentRoom());
      logger.info('Current participant:', client.sfu.getCurrentParticipantId());
      client.sfu.broadcastTranscript(message, true, language);
      setMessage('');
      setSuccess('Message sent!');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err) {
      logger.error('Failed to send message:', err);
      setError('Failed to send message');
    }
  };

  const handleLanguageChange = (newLanguage) => {
    setLanguage(newLanguage);
    if (isInRoom && client?.sfu) {
      client.sfu.changeLanguage(newLanguage);
      setSuccess(`Language changed to ${getLanguageName(newLanguage)}`);
      setTimeout(() => setSuccess(null), 2000);
    }
  };

  const getLanguageName = (code) => {
    const languages = {
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      zh: 'Chinese',
      ja: 'Japanese',
      ar: 'Arabic',
      hi: 'Hindi',
      pt: 'Portuguese',
      ru: 'Russian',
      it: 'Italian',
      ko: 'Korean',
    };
    return languages[code] || code;
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
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
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
              disabled={isJoining}
            >
              <option value="en">🇬🇧 English</option>
              <option value="es">🇪🇸 Spanish</option>
              <option value="fr">🇫🇷 French</option>
              <option value="de">🇩🇪 German</option>
              <option value="zh">🇨🇳 Chinese</option>
              <option value="ja">🇯🇵 Japanese</option>
              <option value="ar">🇸🇦 Arabic</option>
              <option value="hi">🇮🇳 Hindi</option>
              <option value="pt">🇵🇹 Portuguese</option>
              <option value="ru">🇷🇺 Russian</option>
              <option value="it">🇮🇹 Italian</option>
              <option value="ko">🇰🇷 Korean</option>
            </select>
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
        <>
          <div className="flex justify-center gap-4 mb-6">
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

          {/* Message Input */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
            <h4 className="text-base font-semibold text-gray-800 mb-3">Send Message</h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message to broadcast..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSendMessage}
                disabled={!message.trim()}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Send
              </button>
            </div>
          </div>

          {/* Received Messages */}
          {receivedMessages.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="text-base font-semibold text-gray-800 mb-3">Received Messages</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {receivedMessages.map((msg, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-600">
                            {msg.participantId.substring(0, 12)}...
                          </span>
                          <span className="text-xs text-gray-400">
                            {msg.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-800">{msg.text}</p>
                      </div>
                      <button
                        onClick={() => playTextToSpeech(msg.text)}
                        className="flex-shrink-0 p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Play audio"
                      >
                        ▶️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
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

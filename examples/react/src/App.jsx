import { useState } from 'react';
import { useWebvox } from './hooks/useWebvox';
import { VideoCall } from './components/VideoCall';
import { SpeechToText } from './components/SpeechToText';

const API_KEY = import.meta.env.VITE_WEBVOX_API_KEY;
const SERVER_URL = import.meta.env.VITE_WEBVOX_SERVER_URL;

function App() {
  const [activeTab, setActiveTab] = useState('video');
  const { client, isConnected, isLoading, error, connect, disconnect } = useWebvox({
    serverUrl: SERVER_URL,
    apiKey: API_KEY
  });

  if (!API_KEY) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50">
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">❌ API Key Required</h1>
          <p className="text-gray-600 mb-2">Please set VITE_WEBVOX_API_KEY in your .env file</p>
          <p className="text-sm text-gray-500">Contact your administrator to obtain an API key.</p>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50">
        <h1 className="text-3xl font-bold text-gray-800">WebVox Client</h1>

        {error && (
          <div className="px-4 py-3 bg-red-50 text-red-700 rounded-lg border border-red-200 max-w-md">
            <p className="font-medium">Error: {error.message}</p>
          </div>
        )}

        <button
          onClick={connect}
          disabled={isLoading}
          className="px-8 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'Connecting...' : 'Connect to Server'}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b-2 border-gray-200 mb-8">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">WebVox Client Demo</h1>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto flex border-t border-gray-200">
          <button
            onClick={() => setActiveTab('video')}
            className={`
              px-8 py-4 text-base font-medium transition-all
              ${activeTab === 'video'
                ? 'bg-white text-blue-600 border-b-3 border-blue-600'
                : 'bg-gray-50 text-gray-600 border-b-3 border-transparent hover:bg-gray-100'
              }
            `}
          >
            📹 Video Call
          </button>
          <button
            onClick={() => setActiveTab('stt')}
            className={`
              px-8 py-4 text-base font-medium transition-all
              ${activeTab === 'stt'
                ? 'bg-white text-blue-600 border-b-3 border-blue-600'
                : 'bg-gray-50 text-gray-600 border-b-3 border-transparent hover:bg-gray-100'
              }
            `}
          >
            🎤 Speech-to-Text
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-8">
        {activeTab === 'video' && <VideoCall client={client} onDisconnect={disconnect} />}
        {activeTab === 'stt' && <SpeechToText client={client} />}
      </div>
    </div>
  );
}

export default App;

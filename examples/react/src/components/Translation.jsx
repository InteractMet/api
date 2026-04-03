import { useState } from 'react';

const LANGUAGES = [
  { code: 'en',  label: 'English' },
  { code: 'zh',  label: 'Chinese (Simplified)' },
  { code: 'es',  label: 'Spanish' },
  { code: 'fr',  label: 'French' },
  { code: 'de',  label: 'German' },
  { code: 'ar',  label: 'Arabic' },
  { code: 'hi',  label: 'Hindi' },
  { code: 'ur',  label: 'Urdu' },
  { code: 'pt',  label: 'Portuguese' },
  { code: 'ru',  label: 'Russian' },
  { code: 'ja',  label: 'Japanese' },
  { code: 'ko',  label: 'Korean' },
  { code: 'it',  label: 'Italian' },
  { code: 'tr',  label: 'Turkish' },
  { code: 'nl',  label: 'Dutch' },
  { code: 'pl',  label: 'Polish' },
  { code: 'sv',  label: 'Swedish' },
  { code: 'da',  label: 'Danish' },
  { code: 'no',  label: 'Norwegian' },
  { code: 'fi',  label: 'Finnish' },
  { code: 'el',  label: 'Greek' },
  { code: 'he',  label: 'Hebrew' },
  { code: 'cs',  label: 'Czech' },
  { code: 'sk',  label: 'Slovak' },
  { code: 'hu',  label: 'Hungarian' },
  { code: 'ro',  label: 'Romanian' },
  { code: 'bg',  label: 'Bulgarian' },
  { code: 'hr',  label: 'Croatian' },
  { code: 'sl',  label: 'Slovenian' },
  { code: 'et',  label: 'Estonian' },
  { code: 'lv',  label: 'Latvian' },
  { code: 'lt',  label: 'Lithuanian' },
  { code: 'uk',  label: 'Ukrainian' },
  { code: 'sr',  label: 'Serbian' },
  { code: 'id',  label: 'Indonesian' },
  { code: 'ms',  label: 'Malay' },
  { code: 'tl',  label: 'Filipino' },
  { code: 'th',  label: 'Thai' },
  { code: 'vi',  label: 'Vietnamese' },
  { code: 'bn',  label: 'Bengali' },
  { code: 'gu',  label: 'Gujarati' },
  { code: 'ta',  label: 'Tamil' },
  { code: 'te',  label: 'Telugu' },
  { code: 'kn',  label: 'Kannada' },
  { code: 'ml',  label: 'Malayalam' },
  { code: 'mr',  label: 'Marathi' },
  { code: 'pa',  label: 'Punjabi' },
  { code: 'ne',  label: 'Nepali' },
  { code: 'si',  label: 'Sinhala' },
  { code: 'fa',  label: 'Persian' },
  { code: 'ka',  label: 'Georgian' },
  { code: 'hy',  label: 'Armenian' },
  { code: 'az',  label: 'Azerbaijani' },
  { code: 'kk',  label: 'Kazakh' },
  { code: 'uz',  label: 'Uzbek' },
  { code: 'mn',  label: 'Mongolian' },
  { code: 'sw',  label: 'Swahili' },
  { code: 'af',  label: 'Afrikaans' },
  { code: 'am',  label: 'Amharic' },
  { code: 'ha',  label: 'Hausa' },
  { code: 'yo',  label: 'Yoruba' },
  { code: 'ca',  label: 'Catalan' },
  { code: 'eu',  label: 'Basque' },
  { code: 'gl',  label: 'Galician' },
  { code: 'cy',  label: 'Welsh' },
  { code: 'ga',  label: 'Irish' },
  { code: 'is',  label: 'Icelandic' },
  { code: 'mk',  label: 'Macedonian' },
  { code: 'sq',  label: 'Albanian' },
  { code: 'be',  label: 'Belarusian' },
  { code: 'my',  label: 'Burmese' },
  { code: 'km',  label: 'Khmer' },
  { code: 'lo',  label: 'Lao' },
];

export function Translation({ client }) {
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('es');
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState(null);
  const [detectedLang, setDetectedLang] = useState(null);

  const translate = () => {
    if (!sourceText.trim()) return;
    setIsTranslating(true);
    setError(null);
    setTranslatedText('');
    setDetectedLang(null);

    client.socket.emit('translate', {
      text: sourceText.trim(),
      targetLanguage: targetLang,
      sourceLanguage: sourceLang === 'auto' ? null : sourceLang,
    }, (response) => {
      setIsTranslating(false);
      if (response.success) {
        setTranslatedText(response.translatedText);
        if (response.detectedSourceLanguage) setDetectedLang(response.detectedSourceLanguage);
      } else {
        setError(response.error || 'Translation failed');
      }
    });
  };

  const swapLanguages = () => {
    if (sourceLang === 'auto') return;
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSourceText(translatedText);
    setTranslatedText(sourceText);
  };

  const copyTranslation = async () => {
    try {
      await navigator.clipboard.writeText(translatedText);
    } catch {
      setError('Failed to copy');
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Translation</h2>

      {/* Language selectors */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={sourceLang}
          onChange={(e) => setSourceLang(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-white"
        >
          <option value="auto">Detect language</option>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>

        <button
          onClick={swapLanguages}
          disabled={sourceLang === 'auto'}
          className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-lg"
          title="Swap languages"
        >
          ⇄
        </button>

        <select
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 bg-white"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>

      {/* Text areas */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) translate(); }}
            placeholder="Enter text to translate..."
            rows={8}
            className="w-full resize-none focus:outline-none text-gray-800 placeholder-gray-400"
          />
          {detectedLang && (
            <div className="mt-2 text-sm text-gray-400">
              Detected: {LANGUAGES.find(l => l.code === detectedLang)?.label || detectedLang}
            </div>
          )}
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="min-h-48 text-gray-800 whitespace-pre-wrap">
            {isTranslating ? (
              <span className="text-gray-400 italic">Translating...</span>
            ) : translatedText ? (
              translatedText
            ) : (
              <span className="text-gray-400 italic">Translation will appear here</span>
            )}
          </div>
          {translatedText && (
            <div className="flex justify-end mt-2">
              <button onClick={copyTranslation} className="text-sm text-gray-500 hover:text-gray-700">
                📋 Copy
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-red-50 text-red-700 rounded-lg border border-red-200">{error}</div>}

      <div className="flex gap-3">
        <button
          onClick={translate}
          disabled={isTranslating || !sourceText.trim()}
          className="px-8 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isTranslating ? 'Translating...' : 'Translate'}
        </button>
        {sourceText && (
          <button
            onClick={() => { setSourceText(''); setTranslatedText(''); setDetectedLang(null); }}
            className="px-6 py-3 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-colors"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-sm text-gray-400 self-center">Ctrl+Enter to translate</span>
      </div>

    </div>
  );
}

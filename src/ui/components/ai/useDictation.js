import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Voice → text with the device's own speech recognition (free, nothing extra to set up).
 * Claude only receives the text. Where the browser has no speech recognition, the
 * text box still works with the keyboard's microphone button.
 */
export function useDictation({ lang = 'en-US' } = {}) {
  const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  const [listening, setListening] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const rec = useRef(null);
  const base = useRef('');

  const stop = useCallback(() => {
    rec.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!Recognition) return;
    setError(null);
    const r = new Recognition();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    base.current = text ? `${text.trim()} ` : '';
    r.onresult = (e) => {
      let said = '';
      for (let i = 0; i < e.results.length; i += 1) said += e.results[i][0].transcript;
      setText(base.current + said);
    };
    r.onerror = (e) => {
      setError(e.error === 'not-allowed' ? 'Allow the microphone to talk, or type instead.' : 'Couldn’t hear that. Try again or type instead.');
      setListening(false);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  }, [Recognition, lang, text]);

  useEffect(() => () => rec.current?.abort?.(), []);
  return { supported: !!Recognition, listening, start, stop, text, setText, error };
}

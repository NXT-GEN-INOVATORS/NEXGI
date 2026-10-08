import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Alert, Button, CircularProgress, MenuItem, TextField } from '@mui/material';
import { VolumeUpOutlined, StopCircleOutlined } from '@mui/icons-material';
import { generateSpeech } from '@/lib/visiontrace/speech.functions';

export function SpeechPlayer({ text }: { text: string }) {
  const speak = useServerFn(generateSpeech);
  const [busy, setBusy] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  const [language, setLanguage] = useState<'en-IN' | 'hi-IN'>('en-IN');
  const [speaker, setSpeaker] = useState<'shubh' | 'ritu'>('shubh');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const request = useRef(0);

  useEffect(() => {
    request.current++;
    setBusy(false);
    stopPlayback();
    setUrl('');
    setError('');
  }, [text, language, speaker]);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
      stopPlayback();
    };
  }, [url]);

  function stopPlayback() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
  }

  function playViaBrowserSpeech(cleanText: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setError('Web Speech Synthesis is not supported in this browser.');
      setBusy(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = language === 'hi-IN' ? 'hi-IN' : 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      setIsPlaying(true);
      setBusy(false);
    };
    utterance.onend = () => {
      setIsPlaying(false);
    };
    utterance.onerror = () => {
      setIsPlaying(false);
      setBusy(false);
    };

    window.speechSynthesis.speak(utterance);
  }

  async function generate() {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    const cleanText = text.trim();
    if (!cleanText) return;

    const id = ++request.current;
    setBusy(true);
    setError('');
    setUrl('');

    try {
      const result = await speak({
        data: { text: cleanText.slice(0, 2500), language, speaker },
      });

      if (id !== request.current) return;

      if (result.audio) {
        const bytes = Uint8Array.from(atob(result.audio), (c) => c.charCodeAt(0));
        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
        setUrl(blobUrl);
        setIsPlaying(true);
        setBusy(false);
      } else {
        // Fallback directly to native browser speech synthesis with ZERO sign-in
        playViaBrowserSpeech(cleanText);
      }
    } catch {
      if (id === request.current) {
        // Direct browser fallback on any network error or unconfigured API
        playViaBrowserSpeech(cleanText);
      }
    } finally {
      if (id === request.current && !isPlaying) {
        setBusy(false);
      }
    }
  }

  return (
    <section className="speech-player">
      <div className="speech-controls" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Button
          variant={isPlaying ? 'contained' : 'outlined'}
          color={isPlaying ? 'secondary' : 'primary'}
          disabled={busy || !text}
          startIcon={busy ? <CircularProgress size={16} /> : isPlaying ? <StopCircleOutlined /> : <VolumeUpOutlined />}
          onClick={generate}
        >
          {busy ? 'Generating speech…' : isPlaying ? 'Stop Speaking' : 'Listen to Evidence (TTS)'}
        </Button>

        <TextField
          select
          size="small"
          label="Speech language"
          value={language}
          onChange={(e) => setLanguage(e.target.value === 'hi-IN' ? 'hi-IN' : 'en-IN')}
          sx={{ minWidth: 120 }}
        >
          <MenuItem value="en-IN">English</MenuItem>
          <MenuItem value="hi-IN">Hindi / Indian</MenuItem>
        </TextField>

        <TextField
          select
          size="small"
          label="Voice"
          value={speaker}
          onChange={(e) => setSpeaker(e.target.value === 'ritu' ? 'ritu' : 'shubh')}
          sx={{ minWidth: 100 }}
        >
          <MenuItem value="shubh">Shubh</MenuItem>
          <MenuItem value="ritu">Ritu</MenuItem>
        </TextField>

        {isPlaying && (
          <span style={{ fontSize: 12, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            🔊 Playing evidence narration...
          </span>
        )}
      </div>

      {error && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}

      {url && (
        <div className="speech-audio" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <audio
            ref={audioRef}
            src={url}
            autoPlay
            controls
            aria-label="Evidence narration"
            onEnded={() => setIsPlaying(false)}
            onError={() => setError('This audio could not be played.')}
          />
          <Button startIcon={<StopCircleOutlined />} onClick={stopPlayback} size="small" variant="text">
            Stop
          </Button>
        </div>
      )}
    </section>
  );
}

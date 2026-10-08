import { useEffect, useRef, useState } from 'react';
import { CircularProgress, IconButton, Tooltip } from '@mui/material';
import { MicNone, Stop } from '@mui/icons-material';
import { recordWav } from '@/lib/visiontrace/record-wav';

type Recorder = Awaited<ReturnType<typeof recordWav>>;

export function VoiceInput({
  onText,
  onBusy,
  onError,
  onStart,
}: {
  onText: (text: string) => void;
  onBusy: (busy: boolean) => void;
  onError?: (error: string) => void;
  onStart?: () => void;
}) {
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'transcribing'>('idle');
  const [error, setError] = useState('');
  const recorder = useRef<Recorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const controller = useRef<AbortController | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const active = useRef(true);
  const queue = useRef<File[]>([]);
  const draining = useRef(false);
  const stopped = useRef(true);
  const completed = useRef('');
  const callbacks = useRef({ onText, onBusy, onStart });
  callbacks.current = { onText, onBusy, onStart };

  useEffect(() => {
    if (typeof onError === 'function') onError(error);
  }, [error, onError]);

  function clearIntervalTimer() {
    if (interval.current) clearInterval(interval.current);
    interval.current = null;
  }

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
      clearIntervalTimer();
      queue.current = [];
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
        recognitionRef.current = null;
      }
      void recorder.current?.stop().catch(() => {});
      recorder.current = null;
    };
  }, []);

  async function fail(e: unknown) {
    stopped.current = true;
    clearIntervalTimer();
    queue.current = [];
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    const recording = recorder.current;
    recorder.current = null;
    await recording?.stop().catch(() => {});
    if (active.current) {
      setError(e instanceof Error ? e.message : 'Unable to transcribe your question.');
      setState('idle');
      callbacks.current.onBusy(false);
    }
  }

  async function drain() {
    if (draining.current) return;
    draining.current = true;
    try {
      while (queue.current.length && active.current) {
        const file = queue.current.shift();
        if (!file) break;
        const abort = new AbortController();
        controller.current = abort;
        const form = new FormData();
        form.append('file', file);
        const response = await fetch('/api/public/transcribe', {
          method: 'POST',
          body: form,
          signal: abort.signal,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message ?? body.error?.message ?? 'Voice input is unavailable.');
        }
        let text = '';
        const publish = () => {
          if (active.current) {
            callbacks.current.onText([completed.current, text.trim()].filter(Boolean).join(' '));
          }
        };
        if ((response.headers.get('Content-Type') ?? '').includes('text/event-stream')) {
          const reader = response.body?.getReader();
          if (!reader) throw new Error('No transcript received.');
          const decoder = new TextDecoder();
          let buffer = '',
            finished = false;
          const consume = (event: string) => {
            const value = event
              .split(/\r?\n/)
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
              .join('\n');
            if (!value || value === '[DONE]') return;
            const data = JSON.parse(value);
            if (data.type === 'error' || data.error) {
              throw new Error(data.message ?? data.error?.message ?? 'Transcription failed.');
            }
            if (data.type === 'transcript.text.delta') {
              text += data.delta ?? '';
              publish();
            }
            if (data.type === 'transcript.text.done') {
              text = data.text ?? text;
              finished = true;
              publish();
            }
          };
          try {
            while (true) {
              const part = await reader.read();
              buffer += decoder.decode(part.value, { stream: !part.done });
              const events = buffer.split(/\r?\n\r?\n/);
              buffer = events.pop() ?? '';
              for (const event of events) consume(event);
              if (part.done) {
                if (buffer.trim()) consume(buffer);
                break;
              }
            }
          } finally {
            reader.releaseLock();
          }
          if (!finished) throw new Error('Transcription interrupted. Audio kept.');
        } else {
          const body = await response.json();
          text = body.text ?? body.transcript ?? '';
          publish();
        }
        completed.current = [completed.current, text.trim()].filter(Boolean).join(' ');
      }
    } catch (e) {
      if (active.current) await fail(e);
    } finally {
      draining.current = false;
      if (stopped.current && active.current) {
        setState('idle');
        callbacks.current.onBusy(false);
      }
    }
  }

  async function finish() {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
      setState('idle');
      callbacks.current.onBusy(false);
      return;
    }

    const recording = recorder.current;
    if (!recording) return;
    recorder.current = null;
    stopped.current = true;
    clearIntervalTimer();
    setState('transcribing');
    try {
      const file = await recording.stop();
      if (active.current) queue.current.push(file);
    } catch (e) {
      if (!completed.current && !queue.current.length && !draining.current) {
        await fail(e);
        return;
      }
    }
    if (active.current) void drain();
  }

  async function start() {
    setError('');
    setState('starting');
    callbacks.current.onBusy(true);
    callbacks.current.onStart?.();
    completed.current = '';
    queue.current = [];
    stopped.current = false;

    // First attempt: Browser-native Speech Recognition (Instant, Zero sign-in, No external server)
    const SpeechRecognition =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
          if (!active.current) return;
          setState('recording');
        };

        recognition.onresult = (event: any) => {
          if (!active.current) return;
          let fullTranscript = '';
          for (let i = 0; i < event.results.length; i++) {
            fullTranscript += event.results[i][0].transcript;
          }
          if (fullTranscript.trim()) {
            callbacks.current.onText(fullTranscript.trim());
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error === 'not-allowed') {
            setError('Microphone permission denied. Allow microphone access in your browser.');
          } else if (event.error !== 'no-speech') {
            setError(`Speech recognition note: ${event.error}`);
          }
          setState('idle');
          callbacks.current.onBusy(false);
        };

        recognition.onend = () => {
          if (active.current) {
            setState('idle');
            callbacks.current.onBusy(false);
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
        return;
      } catch {
        // Fall back to recordWav + /api/public/transcribe below
      }
    }

    // Fallback: Audio recording + backend transcribe (without sign-in)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access requires a supported browser and a secure connection.');
      }
      const recording = await recordWav();
      if (!active.current) {
        await recording.stop().catch(() => {});
        return;
      }
      recorder.current = recording;
      setState('recording');
      interval.current = setInterval(() => {
        const chunk = recorder.current?.takeChunk();
        if (chunk) queue.current.push(chunk);
        void drain();
        if (queue.current.length >= 12) void finish();
      }, 5000);
    } catch (e) {
      await fail(
        e instanceof DOMException && e.name === 'NotAllowedError'
          ? new Error('Microphone permission denied. Allow microphone access in your browser and try again.')
          : e instanceof DOMException && e.name === 'NotFoundError'
          ? new Error('No microphone found. Connect a microphone and try again.')
          : e
      );
    }
  }

  const recording = state === 'recording';
  const busy = state === 'starting' || state === 'transcribing';

  return (
    <Tooltip
      title={
        recording ? 'Stop listening' : busy ? 'Transcribing your question' : 'Speak your question (Voice STT)'
      }
    >
      <IconButton
        aria-label={recording ? 'Stop recording' : busy ? 'Transcribing your question' : 'Speak your question'}
        disabled={busy}
        color={recording ? 'error' : 'default'}
        onClick={() => void (recording ? finish() : start())}
      >
        {busy ? <CircularProgress size={20} /> : recording ? <Stop /> : <MicNone />}
      </IconButton>
    </Tooltip>
  );
}

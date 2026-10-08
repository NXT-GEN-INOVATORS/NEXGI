import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';

export const generateSpeech = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .object({
        text: z.string().trim().min(1).max(2500),
        language: z.enum(['en-IN', 'hi-IN']).default('en-IN'),
        speaker: z.enum(['shubh', 'ritu']).default('shubh'),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const key = process.env['SARVAM_API_KEY'];
    if (!key) return { audio: null, error: null, fallbackToBrowser: true };
    try {
      const response = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-subscription-key': key },
        body: JSON.stringify({
          text: data.text,
          language_code: data.language,
          speaker: data.speaker,
          model: 'bulbul:v3',
          speech_sample_rate: 24000,
          output_audio_codec: 'wav',
        }),
        signal: AbortSignal.timeout(45000),
      });
      if (!response.ok) {
        return {
          audio: null,
          error:
            response.status === 401 || response.status === 403
              ? 'Sarvam rejected API key.'
              : response.status === 429
              ? 'Sarvam usage limit reached.'
              : 'Sarvam speech generation unavailable.',
          fallbackToBrowser: true,
        };
      }
      const result: unknown = await response.json();
      const parsed = z.object({ audios: z.array(z.string().min(1)).min(1) }).safeParse(result);
      if (!parsed.success) return { audio: null, error: null, fallbackToBrowser: true };
      return { audio: parsed.data.audios[0] ?? null, error: null, fallbackToBrowser: false };
    } catch {
      return { audio: null, error: null, fallbackToBrowser: true };
    }
  });

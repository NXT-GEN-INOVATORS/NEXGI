import { createFileRoute } from '@tanstack/react-router';

const maxBytes = 4 * 1024 * 1024;

export const Route = createFileRoute('/api/public/transcribe')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (Number(request.headers.get('Content-Length')) > maxBytes) {
          return Response.json({ message: 'Recording is too large. Record a shorter question.' }, { status: 413 });
        }

        const reader = request.body?.getReader();
        if (!reader) {
          return Response.json({ message: 'No recording received.' }, { status: 400 });
        }

        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > maxBytes) {
            await reader.cancel();
            return Response.json({ message: 'Recording is too large. Record a shorter question.' }, { status: 413 });
          }
          chunks.push(part.value);
        }

        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }

        try {
          const form = await new Response(bytes, {
            headers: { 'Content-Type': request.headers.get('Content-Type') ?? '' },
          }).formData();
          const file = form.get('file');

          if (!(file instanceof File) || file.type !== 'audio/wav' || file.size < 2048 || file.size > maxBytes - 1024) {
            return Response.json({ message: 'Record a clear, short question and try again.' }, { status: 400 });
          }

          const key = process.env['LOVABLE_API_KEY'];
          if (!key) {
            return Response.json({ message: 'Voice input is not configured.' }, { status: 503 });
          }

          const { transcribe } = await import('@/lib/visiontrace/transcribe.server');
          const response = await transcribe(
            {
              baseURL: 'https://ai.gateway.lovable.dev',
              apiKey: key,
              model: 'openai/gpt-transcribe',
              maxFileBytes: maxBytes - 1024,
              audioOnly: true,
            },
            file,
            { signal: request.signal }
          );

          return new Response(response.body, {
            status: response.status,
            headers: {
              'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
              'Cache-Control': 'no-store',
            },
          });
        } catch {
          return Response.json({ message: 'Voice input is unavailable. Please try again.' }, { status: 503 });
        }
      },
    },
  },
});

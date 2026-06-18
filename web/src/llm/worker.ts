// Web worker hosting a tiny quantized Gemma for one-sentence summaries of
// long AI review comments. Runs fully in-browser (WebGPU when available,
// WASM otherwise) — no comment text ever leaves the machine.
import { pipeline, TextGenerationPipeline } from '@huggingface/transformers';

const MODEL = 'onnx-community/gemma-3-270m-it-ONNX';

let generatorPromise: Promise<TextGenerationPipeline> | null = null;

function loadGenerator(): Promise<TextGenerationPipeline> {
  if (!generatorPromise) {
    const device = 'gpu' in navigator ? 'webgpu' : 'wasm';
    generatorPromise = pipeline('text-generation', MODEL, {
      dtype: 'q4',
      device,
      progress_callback: (p: { status: string; progress?: number; file?: string }) => {
        if (p.status === 'progress' && p.progress !== undefined) {
          postMessage({ type: 'progress', progress: Math.round(p.progress) });
        }
      },
    }) as Promise<TextGenerationPipeline>;
    // a failed load (network blip mid-download) must not poison retries
    generatorPromise = generatorPromise.catch((err) => {
      generatorPromise = null;
      throw err;
    });
  }
  return generatorPromise;
}

type Kind = 'comment' | 'thread' | 'file' | 'slice' | 'intent';

interface Job {
  id: number;
  text: string;
  kind?: Kind;
}

const PROMPT: Record<Kind, string> = {
  comment: 'What is this code review comment asking for? Answer in one plain sentence, no markdown.',
  thread:
    'Summarize this code review discussion in one or two plain sentences: the concern raised and where it landed. No markdown.',
  file: 'Summarize what this diff changes in one or two plain sentences. Describe behaviour, not syntax. No markdown.',
  slice:
    'These diffs are one area of a pull request. In one or two plain sentences say what this area does. No markdown.',
  intent:
    'Summarize the intent of this change — the why — in one or two plain sentences. No markdown.',
};

onmessage = async (e: MessageEvent<Job>) => {
  const { id, text, kind = 'comment' } = e.data;
  try {
    const generate = await loadGenerator();
    // For prose (comments) fenced code blocks just burn the tiny context; for
    // diffs the code IS the content, so keep the line structure.
    const isProse = kind === 'comment' || kind === 'thread';
    const cleaned = isProse
      ? text.replace(/```[\s\S]*?```/g, ' (code) ').replace(/\s+/g, ' ').trim().slice(0, 3000)
      : text.trim().slice(0, 3500);
    const messages = [{ role: 'user', content: `${PROMPT[kind]}\n\n${cleaned}` }];
    const out = await generate(messages, {
      max_new_tokens: isProse ? 60 : 90,
      do_sample: false,
    });
    const last = (out[0] as { generated_text: { content: string }[] }).generated_text.at(-1);
    const summary = (last?.content ?? '')
      .replace(/[`*#>"]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 320);
    postMessage({ type: 'result', id, summary });
  } catch (err) {
    postMessage({ type: 'error', id, error: String(err) });
  }
};

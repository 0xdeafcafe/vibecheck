// Web worker hosting a tiny quantized Gemma for one-sentence summaries of
// long AI review comments. Runs fully in-browser (WebGPU when available,
// WASM otherwise) — no comment text ever leaves the machine.
import { pipeline, TextGenerationPipeline } from '@huggingface/transformers';

const DEFAULT_MODEL = 'onnx-community/gemma-3-1b-it-ONNX';

// One pipeline per model id, so switching models keeps each one cached.
const generators = new Map<string, Promise<TextGenerationPipeline>>();

function createPipeline(model: string, device: 'webgpu' | 'wasm'): Promise<TextGenerationPipeline> {
  return pipeline('text-generation', model, {
    dtype: 'q4',
    device,
    progress_callback: (p: { status: string; progress?: number; file?: string }) => {
      if (p.status === 'progress' && p.progress !== undefined) {
        postMessage({ type: 'progress', progress: Math.round(p.progress) });
      }
    },
  }) as Promise<TextGenerationPipeline>;
}

function loadGenerator(model: string): Promise<TextGenerationPipeline> {
  let g = generators.get(model);
  if (!g) {
    const wantsGpu = 'gpu' in navigator;
    g = createPipeline(model, wantsGpu ? 'webgpu' : 'wasm')
      .catch((err) => {
        // WebGPU is sometimes reported present but has no usable adapter
        // (headless / some browsers) — fall back to CPU/WASM rather than
        // failing silently.
        if (wantsGpu) return createPipeline(model, 'wasm');
        throw err;
      })
      .catch((err) => {
        // a failed load (network blip mid-download) must not poison retries
        generators.delete(model);
        throw err;
      });
    generators.set(model, g);
  }
  return g;
}

type Kind = 'comment' | 'thread' | 'file' | 'slice' | 'intent';

interface Job {
  id: number;
  text: string;
  kind?: Kind;
  model?: string;
}

const PROMPT: Record<Kind, string> = {
  comment:
    'Summarize this code review comment in ONE short sentence of plain English — what it asks the author to change. No code, no markdown, no quoting.',
  thread:
    'Summarize this code review discussion in one or two sentences of plain English: the concern and how it resolved. No code, no markdown.',
  file:
    'Below is a code diff. In one or two sentences of plain English, describe what the change does to the behaviour. Do NOT output code, comments, file names or markdown.',
  slice:
    'Below are the diffs for one area of a pull request. In one or two sentences of plain English, describe what this area of the change accomplishes overall. Do NOT list files. Do NOT output code, comments or markdown.',
  intent:
    'Below is a change description and its spec/ADR diffs. In one or two sentences of plain English, state the intent — the why — of this change. Do NOT output code or markdown.',
};

onmessage = async (e: MessageEvent<Job>) => {
  const { id, text, kind = 'comment', model } = e.data;
  try {
    const generate = await loadGenerator(model ?? DEFAULT_MODEL);
    // For prose (comments) fenced code blocks just burn the tiny context; for
    // diffs the code IS the content, so keep the line structure.
    const isProse = kind === 'comment' || kind === 'thread';
    const cleaned = isProse
      ? text.replace(/```[\s\S]*?```/g, ' (code) ').replace(/\s+/g, ' ').trim().slice(0, 3000)
      : text.trim().slice(0, 3500);
    const messages = [{ role: 'user', content: `${PROMPT[kind]}\n\n${cleaned}` }];
    const out = await generate(messages, {
      max_new_tokens: isProse ? 64 : 96,
      do_sample: false,
      repetition_penalty: 1.3,
      no_repeat_ngram_size: 4,
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

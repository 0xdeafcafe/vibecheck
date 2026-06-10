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

interface Job {
  id: number;
  text: string;
}

onmessage = async (e: MessageEvent<Job>) => {
  const { id, text } = e.data;
  try {
    const generate = await loadGenerator();
    // Code blocks confuse a 270M model and burn its context — the prose
    // around them carries the point of the comment.
    const prose = text
      .replace(/```[\s\S]*?```/g, ' (code) ')
      .replace(/\s+/g, ' ')
      .trim();
    const messages = [
      {
        role: 'user',
        content: `What is this code review comment asking for? Answer in one plain sentence, no markdown.\n\nComment: ${prose.slice(0, 3000)}`,
      },
    ];
    const out = await generate(messages, { max_new_tokens: 60, do_sample: false });
    const last = (out[0] as { generated_text: { content: string }[] }).generated_text.at(-1);
    const summary = (last?.content ?? '')
      .replace(/[`*#>"]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
    postMessage({ type: 'result', id, summary });
  } catch (err) {
    postMessage({ type: 'error', id, error: String(err) });
  }
};

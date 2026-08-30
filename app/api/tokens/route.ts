import { NextResponse } from 'next/server';
import { encodingForModel } from 'js-tiktoken';

export const runtime = 'nodejs';

const DEFAULT_PRICES_IDR = {
  'gpt-4o': 125_000,
  claude: 75_000,
} as const;

function getPrice(model: keyof typeof DEFAULT_PRICES_IDR) {
  const envName = model === 'gpt-4o' ? 'GPT4O_INPUT_IDR_PER_1M' : 'CLAUDE_INPUT_IDR_PER_1M';
  const parsed = Number(process.env[envName]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_PRICES_IDR[model];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text = typeof body.text === 'string' ? body.text : '';
    const model = body.model === 'claude' ? 'claude' : 'gpt-4o';

    if (!text.trim()) return NextResponse.json({ error: 'Text is required.' }, { status: 400 });
    if (text.length > 1_000_000) return NextResponse.json({ error: 'Text is limited to 1,000,000 characters.' }, { status: 413 });

    let tokens: number;
    let note: string | undefined;

    if (model === 'gpt-4o') {
      const encoding = encodingForModel('gpt-4o');
      tokens = encoding.encode(text).length;
      encoding.free();
    } else {
      // Claude does not use OpenAI's tiktoken vocabulary. This is a transparent
      // estimate using the common ~4 characters/token heuristic, not an exact count.
      tokens = Math.max(1, Math.ceil(text.length / 4));
      note = 'Claude count is an estimate; exact Claude tokenization is model-specific.';
    }

    const inputPerMillionIdr = getPrice(model);
    const inputCostIdr = Math.round((tokens / 1_000_000) * inputPerMillionIdr);

    return NextResponse.json({
      tokens,
      model,
      currency: 'IDR',
      inputCostIdr,
      pricing: { inputPerMillionIdr },
      ...(note ? { note } : {}),
    });
  } catch {
    return NextResponse.json({ error: 'Invalid request or tokenization failure.' }, { status: 400 });
  }
}

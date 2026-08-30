# PromptForge

Neo-Brutalist Next.js toolkit for LLM token estimation and prompt expansion.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- `js-tiktoken` for GPT-4o tokenization on the server
- Google Generative AI SDK for prompt expansion
- No database
- Vercel-compatible Node.js API routes

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `GEMINI_API_KEY` in `.env.local`. The API key is read only by the server route and is never exposed to the browser.

## Pricing

Token prices are configurable through `GPT4O_INPUT_IDR_PER_1M` and `CLAUDE_INPUT_IDR_PER_1M`. The committed values are placeholders and should be replaced with current provider pricing before production use. Claude token counts use a character-based estimate because `js-tiktoken` does not implement Claude's tokenizer.

## Vercel

Import the repository into Vercel, keep the default Next.js build settings, and add the environment variables from `.env.example` in the Vercel project settings.

`GEMINI_MODEL` defaults to `gemini-1.5-flash` because that was the requested model. If Google no longer exposes that model to your API project, set `GEMINI_MODEL` to an available Gemini model without changing application code.

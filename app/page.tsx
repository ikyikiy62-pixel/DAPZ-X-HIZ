'use client';

import { useState } from 'react';

type TokenResult = {
  tokens: number;
  model: string;
  currency: string;
  inputCostIdr: number;
  pricing: { inputPerMillionIdr: number };
  note?: string;
};

function Logo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-10 w-10" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="42" height="42" fill="#FFE45C" stroke="black" strokeWidth="4" />
      <path d="M13 17L21 24L13 31M26 31H36" stroke="black" strokeWidth="4" strokeLinecap="square" />
    </svg>
  );
}

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
}

function CopyIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3"><rect x="8" y="8" width="11" height="11"/><path d="M5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1"/></svg>;
}

export default function Home() {
  const [tokenText, setTokenText] = useState('');
  const [model, setModel] = useState<'gpt-4o' | 'claude'>('gpt-4o');
  const [tokenResult, setTokenResult] = useState<TokenResult | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [idea, setIdea] = useState('');
  const [expanded, setExpanded] = useState('');
  const [expandLoading, setExpandLoading] = useState(false);
  const [expandError, setExpandError] = useState('');

  async function calculateTokens() {
    if (!tokenText.trim()) return;
    setTokenLoading(true); setTokenError(''); setTokenResult(null);
    try {
      const res = await fetch('/api/tokens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: tokenText, model }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Token calculation failed.');
      setTokenResult(data);
    } catch (error) { setTokenError(error instanceof Error ? error.message : 'Unexpected error.'); }
    finally { setTokenLoading(false); }
  }

  async function expandPrompt() {
    if (!idea.trim()) return;
    setExpandLoading(true); setExpandError(''); setExpanded('');
    try {
      const res = await fetch('/api/expand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idea }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Expansion failed.');
      setExpanded(data.expanded);
    } catch (error) { setExpandError(error instanceof Error ? error.message : 'Unexpected error.'); }
    finally { setExpandLoading(false); }
  }

  async function copyExpanded() {
    if (!expanded) return;
    await navigator.clipboard.writeText(expanded);
  }

  return (
    <main className="min-h-screen grid-paper">
      <header className="border-b-4 border-black bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
          <div className="flex items-center gap-4"><Logo /><div><p className="text-2xl font-black tracking-tight">PROMPTFORGE</p><p className="text-xs font-bold uppercase tracking-[0.2em]">Developer AI Toolkit</p></div></div>
          <div className="hidden border-4 border-black bg-[#9FF3C8] px-4 py-2 text-xs font-black uppercase shadow-neo sm:block">No database</div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-16">
        <div className="mb-10 max-w-3xl">
          <p className="mb-3 inline-block border-4 border-black bg-[#FFB067] px-3 py-1 text-sm font-black uppercase shadow-neo">Build sharper prompts</p>
          <h1 className="text-5xl font-black uppercase leading-[0.9] tracking-[-0.05em] sm:text-7xl">Tokens in.<br />Better specs out.</h1>
          <p className="mt-6 max-w-2xl text-lg font-bold leading-7">A deliberately rigid workspace for estimating LLM input cost and turning rough product ideas into implementation-ready prompts.</p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="border-4 border-black bg-[#FFE45C] p-5 shadow-neo-lg sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-sm font-black uppercase">01 / Token Calculator</p><h2 className="mt-1 text-3xl font-black uppercase">Estimate usage</h2></div><div className="border-4 border-black bg-white px-3 py-2 font-black">TOK</div></div>
            <textarea value={tokenText} onChange={(e) => setTokenText(e.target.value)} placeholder="Paste code, prompt, JSON, or any text..." className="neo-control min-h-48 w-full resize-y bg-white p-4 font-mono text-sm" />
            <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]">
              <select value={model} onChange={(e) => setModel(e.target.value as 'gpt-4o' | 'claude')} className="neo-control bg-white px-4 py-3 font-black"><option value="gpt-4o">GPT-4o</option><option value="claude">Claude (estimate)</option></select>
              <button onClick={calculateTokens} disabled={tokenLoading || !tokenText.trim()} className="neo-control flex items-center justify-center gap-2 bg-black px-6 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{tokenLoading ? 'CALCULATING...' : 'CALCULATE'} <ArrowIcon /></button>
            </div>
            {tokenError && <div className="mt-5 border-4 border-black bg-white p-4 font-bold">{tokenError}</div>}
            {tokenResult && <div className="mt-6 border-4 border-black bg-white p-5 shadow-neo">
              <p className="text-xs font-black uppercase">Estimated input</p><p className="mt-1 text-5xl font-black">{tokenResult.tokens.toLocaleString('id-ID')}</p><p className="font-mono text-sm font-bold">TOKENS · {tokenResult.model.toUpperCase()}</p>
              <div className="mt-5 border-t-4 border-black pt-4"><p className="text-xs font-black uppercase">Estimated input cost</p><p className="text-3xl font-black">Rp {tokenResult.inputCostIdr.toLocaleString('id-ID')}</p><p className="mt-1 text-xs font-bold">Based on configured price: Rp {tokenResult.pricing.inputPerMillionIdr.toLocaleString('id-ID')} / 1M tokens.</p></div>
              {tokenResult.note && <p className="mt-3 text-xs font-bold">{tokenResult.note}</p>}
            </div>}
          </section>

          <section className="border-4 border-black bg-[#9FF3C8] p-5 shadow-neo-lg sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-sm font-black uppercase">02 / Prompt Expander</p><h2 className="mt-1 text-3xl font-black uppercase">Turn ideas into specs</h2></div><div className="border-4 border-black bg-white px-3 py-2 font-black">AI</div></div>
            <textarea value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="Example: Build a dashboard for tracking API costs..." className="neo-control min-h-48 w-full resize-y bg-white p-4 font-mono text-sm" />
            <button onClick={expandPrompt} disabled={expandLoading || !idea.trim()} className="neo-control mt-5 flex w-full items-center justify-center gap-2 bg-black px-6 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{expandLoading ? 'EXPANDING...' : 'EXPAND'} <ArrowIcon /></button>
            {expandError && <div className="mt-5 border-4 border-black bg-white p-4 font-bold">{expandError}</div>}
            {expanded && <div className="mt-6 border-4 border-black bg-white p-5 shadow-neo">
              <div className="mb-4 flex items-center justify-between border-b-4 border-black pb-3"><p className="font-black uppercase">Generated specification</p><button onClick={copyExpanded} className="neo-control flex items-center gap-2 bg-[#FFB067] px-3 py-2 text-xs font-black"><CopyIcon /> COPY</button></div>
              <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap font-mono text-sm leading-6">{expanded}</pre>
            </div>}
          </section>
        </div>

        <footer className="mt-12 flex flex-col gap-2 border-t-4 border-black pt-5 text-xs font-black uppercase sm:flex-row sm:justify-between"><span>Next.js App Router / Vercel-ready</span><span>Server-side API keys only</span></footer>
      </section>
    </main>
  );
}

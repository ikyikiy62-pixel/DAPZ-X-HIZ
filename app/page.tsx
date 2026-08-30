"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "../lib/supabase-browser";

type Profile = { id: string; username: string; display_name: string | null; avatar_url: string | null };
type Conversation = { id: string; user_a: string; user_b: string; created_at: string; other?: Profile; lastMessage?: string; lastAt?: string };
type Message = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };

const sb = () => createSupabaseBrowserClient();

function Logo({ small = false }: { small?: boolean }) {
  return <div className={`grid shrink-0 place-items-center rounded-full bg-[#075e54] text-white ${small ? "h-9 w-9" : "h-11 w-11"}`} aria-label="Nametag">
    <svg viewBox="0 0 40 40" className={small ? "h-5 w-5" : "h-6 w-6"} fill="none"><path d="M8 9.5h24v17H18l-7 5v-5H8z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="M14 15h12M14 20h7" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
  </div>;
}

function Avatar({ profile, size = "md" }: { profile?: Profile | null; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-9 w-9 text-xs", md: "h-11 w-11 text-sm", lg: "h-20 w-20 text-2xl" };
  if (profile?.avatar_url) return <img src={profile.avatar_url} alt="" className={`${sizes[size]} shrink-0 rounded-full object-cover`} />;
  return <div className={`${sizes[size]} grid shrink-0 place-items-center rounded-full bg-[#d8f3dc] font-bold text-[#075e54]`}>{(profile?.display_name || profile?.username || "?")[0].toUpperCase()}</div>;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [showProfile, setShowProfile] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mobileChat, setMobileChat] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadProfile(current: User) {
    const { data } = await sb().from("profiles").select("id, username, display_name, avatar_url").eq("id", current.id).single();
    if (data) { setProfile(data); setUsername(data.username); setDisplayName(data.display_name ?? ""); }
    await loadConversations(current.id);
  }

  async function loadConversations(userId: string) {
    const client = sb();
    const { data } = await client.from("conversations").select("id, user_a, user_b, created_at").or(`user_a.eq.${userId},user_b.eq.${userId}`).order("created_at", { ascending: false });
    const rows = (data ?? []) as Conversation[];
    if (!rows.length) { setConversations([]); return; }
    const ids = rows.map(r => r.user_a === userId ? r.user_b : r.user_a);
    const { data: people } = await client.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
    const enriched = rows.map(r => ({ ...r, other: (people ?? []).find(p => p.id === (r.user_a === userId ? r.user_b : r.user_a)) }));
    const withLast = await Promise.all(enriched.map(async c => {
      const { data: last } = await client.from("messages").select("body, created_at").eq("conversation_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return { ...c, lastMessage: last?.body, lastAt: last?.created_at };
    }));
    withLast.sort((a, b) => new Date(b.lastAt || b.created_at).getTime() - new Date(a.lastAt || a.created_at).getTime());
    setConversations(withLast);
    setSelected(current => current ? withLast.find(x => x.id === current.id) ?? current : null);
  }

  useEffect(() => {
    let alive = true;
    const client = sb();
    client.auth.getUser().then(async ({ data }) => { if (!alive) return; setUser(data.user); if (data.user) await loadProfile(data.user); setLoading(false); });
    const { data: auth } = client.auth.onAuthStateChange(async (_event, session) => {
      if (!alive) return;
      setUser(session?.user ?? null);
      if (session?.user) await loadProfile(session.user);
      else { setProfile(null); setConversations([]); setSelected(null); setMessages([]); }
    });
    return () => { alive = false; auth.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    let alive = true;
    const client = sb();
    client.from("messages").select("id, conversation_id, sender_id, body, created_at").eq("conversation_id", selected.id).order("created_at", { ascending: true }).then(({ data }) => { if (alive) setMessages((data ?? []) as Message[]); });
    const channel = client.channel(`chat-${selected.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selected.id}` }, payload => {
      const incoming = payload.new as Message;
      setMessages(old => old.some(m => m.id === incoming.id) ? old : [...old, incoming]);
      setConversations(old => old.map(c => c.id === selected.id ? { ...c, lastMessage: incoming.body, lastAt: incoming.created_at } : c).sort((a,b) => new Date(b.lastAt || b.created_at).getTime() - new Date(a.lastAt || a.created_at).getTime()));
    }).subscribe();
    return () => { alive = false; client.removeChannel(channel); };
  }, [selected?.id]);

  useEffect(() => { requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })); }, [messages.length, selected?.id]);

  async function login() {
    setError("");
    const redirectTo = `${window.location.origin}/auth/callback?next=/`;
    const { error: e } = await sb().auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (e) setError(e.message);
  }

  async function logout() { await sb().auth.signOut(); setMobileChat(false); }

  async function searchUsers(value: string) {
    setSearch(value);
    if (!value.trim() || !user) { setResults([]); return; }
    const clean = value.trim().replace(/^@/, "").toLowerCase();
    const { data } = await sb().from("profiles").select("id, username, display_name, avatar_url").ilike("username", `${clean}%`).neq("id", user.id).limit(8);
    setResults(data ?? []);
  }

  async function startChat(other: Profile) {
    if (!user || busy) return;
    setBusy(true); setError("");
    const [a, b] = [user.id, other.id].sort();
    const client = sb();
    let { data: conv } = await client.from("conversations").select("id, user_a, user_b, created_at").eq("user_a", a).eq("user_b", b).maybeSingle();
    if (!conv) {
      const created = await client.from("conversations").insert({ user_a: a, user_b: b }).select("id, user_a, user_b, created_at").single();
      conv = created.data;
      if (!conv && created.error) { const retry = await client.from("conversations").select("id, user_a, user_b, created_at").eq("user_a", a).eq("user_b", b).single(); conv = retry.data; }
    }
    setBusy(false);
    if (!conv) { setError("Chat tidak dapat dibuat. Coba lagi."); return; }
    const item = { ...(conv as Conversation), other };
    setConversations(old => [item, ...old.filter(c => c.id !== item.id)]);
    setSelected(item); setMobileChat(true); setSearch(""); setResults([]);
  }

  async function sendMessage() {
    const body = text.trim();
    if (!user || !selected || !body || busy) return;
    setBusy(true); setError("");
    const { data, error: e } = await sb().from("messages").insert({ conversation_id: selected.id, sender_id: user.id, body }).select("id, conversation_id, sender_id, body, created_at").single();
    setBusy(false);
    if (e || !data) { setError(e?.message || "Pesan gagal dikirim."); return; }
    setText("");
    setMessages(old => old.some(m => m.id === data.id) ? old : [...old, data as Message]);
    setConversations(old => old.map(c => c.id === selected.id ? { ...c, lastMessage: body, lastAt: data.created_at } : c).sort((a,b) => new Date(b.lastAt || b.created_at).getTime() - new Date(a.lastAt || a.created_at).getTime()));
  }

  async function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); await sendMessage(); }
  }

  async function saveProfile() {
    if (!user || !/^[a-z0-9_]{3,24}$/.test(username)) { setError("Nametag harus 3–24 karakter: huruf kecil, angka, atau underscore."); return; }
    setBusy(true); const { data, error: e } = await sb().from("profiles").update({ username, display_name: displayName.trim() || null }).eq("id", user.id).select("id, username, display_name, avatar_url").single(); setBusy(false);
    if (e) setError(e.code === "23505" ? "Nametag sudah dipakai." : e.message); else { setProfile(data); setShowProfile(false); }
  }

  async function uploadAvatar(file: File) {
    if (!user) return;
    if (!file.type.startsWith("image/")) { setError("Pilih file gambar."); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Ukuran foto maksimal 5 MB."); return; }
    setBusy(true); setError("");
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/avatar.${ext}`;
    const client = sb();
    const { error: uploadError } = await client.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
    if (uploadError) { setBusy(false); setError(uploadError.message); return; }
    const { data: publicData } = client.storage.from("avatars").getPublicUrl(path);
    const avatar_url = `${publicData.publicUrl}?v=${Date.now()}`;
    const { data, error: e } = await client.from("profiles").update({ avatar_url }).eq("id", user.id).select("id, username, display_name, avatar_url").single();
    setBusy(false); if (e) setError(e.message); else setProfile(data);
  }

  if (loading) return <main className="grid min-h-[100dvh] place-items-center bg-[#efeae2] text-[#111b21]"><div className="text-center"><Logo /><p className="mt-3 text-sm font-semibold">Memuat Nametag...</p></div></main>;

  if (!user) return <main className="grid min-h-[100dvh] place-items-center bg-[#efeae2] p-5 text-[#111b21]"><section className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-xl md:p-10"><div className="flex items-center gap-3"><Logo /><div><h1 className="text-2xl font-bold">Nametag</h1><p className="text-sm text-gray-500">Private messaging, without phone numbers.</p></div></div><h2 className="mt-10 text-4xl font-bold tracking-tight">Chat lebih simpel.</h2><p className="mt-4 leading-7 text-[#667781]">Temukan teman dengan nametag dan kirim pesan secara realtime.</p><button onClick={login} className="mt-8 flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#d1d7db] bg-white px-5 py-3 font-semibold shadow-sm active:scale-[.99]">Continue with Google</button>{error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}</section></main>;

  const chatName = selected?.other?.display_name || selected?.other?.username || "Pilih chat";

  return <main className="h-[100dvh] overflow-hidden bg-[#efeae2] text-[#111b21] overscroll-none">
    <div className="mx-auto flex h-full max-w-[1500px] overflow-hidden bg-white shadow-xl">
      <aside className={`${mobileChat ? "hidden md:flex" : "flex"} h-full w-full shrink-0 flex-col border-r border-[#d9dee0] md:w-[390px]`}>
        <header className="flex h-16 shrink-0 items-center justify-between bg-[#f0f2f5] px-4"><div className="flex min-w-0 items-center gap-3"><Logo small /><div className="min-w-0"><p className="truncate font-bold">Nametag</p><p className="truncate text-xs text-[#667781]">@{profile?.username}</p></div></div><button onClick={() => setShowProfile(true)} className="rounded-full p-1" aria-label="Profil"><Avatar profile={profile} size="sm" /></button></header>
        <div className="shrink-0 border-b border-[#e5e7e9] bg-white p-3"><div className="flex items-center gap-2 rounded-lg bg-[#f0f2f5] px-3"><svg viewBox="0 0 24 24" className="h-5 w-5 text-[#667781]" fill="none"><circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2"/><path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg><input value={search} onChange={e => searchUsers(e.target.value)} placeholder="Cari dengan @nametag" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>{results.length > 0 && <div className="mt-2 overflow-hidden rounded-xl border border-[#e0e4e6] bg-white shadow-lg">{results.map(person => <button key={person.id} onClick={() => startChat(person)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[#f5f6f6]"><Avatar profile={person} size="sm" /><span className="min-w-0"><span className="block truncate font-semibold">{person.display_name || `@${person.username}`}</span><span className="block truncate text-xs text-[#667781]">@{person.username}</span></span></button>)}</div>}</div>
        <div className="min-h-0 flex-1 overflow-y-auto">{conversations.length === 0 ? <div className="px-6 py-14 text-center"><p className="font-semibold">Belum ada chat</p><p className="mt-1 text-sm text-[#667781]">Cari @nametag teman untuk memulai percakapan.</p></div> : conversations.map(c => <button key={c.id} onClick={() => { setSelected(c); setMobileChat(true); }} className={`flex w-full items-center gap-3 border-b border-[#f0f2f2] px-4 py-3 text-left ${selected?.id === c.id ? "bg-[#f0f2f5]" : "bg-white hover:bg-[#f7f8f8]"}`}><Avatar profile={c.other} /><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{c.other?.display_name || `@${c.other?.username}`}</span><span className="block truncate text-sm text-[#667781]">{c.lastMessage || `@${c.other?.username}`}</span></span>{c.lastAt && <time className="self-start pt-1 text-[11px] text-[#667781]">{new Date(c.lastAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>}</button>)}</div>
      </aside>

      <section className={`${mobileChat ? "flex" : "hidden md:flex"} h-full min-w-0 flex-1 flex-col`}>
        {selected ? <>
          <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[#d9dee0] bg-[#f0f2f5] px-3"><button onClick={() => setMobileChat(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-[#e2e5e7] md:hidden" aria-label="Kembali"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none"><path d="m15 18-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></button><Avatar profile={selected.other} /><div className="min-w-0"><p className="truncate font-semibold">{chatName}</p><p className="truncate text-xs text-[#667781]">@{selected.other?.username}</p></div></header>
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#efeae2] px-3 py-4 md:px-8" style={{ backgroundImage: "radial-gradient(#d8d0c5 1px, transparent 1px)", backgroundSize: "20px 20px" }}><div className="mx-auto flex w-full max-w-3xl flex-col gap-1">{messages.length === 0 ? <div className="mx-auto mt-8 rounded-lg bg-white/80 px-4 py-2 text-center text-xs text-[#667781] shadow-sm">Belum ada pesan. Kirim pesan pertama.</div> : messages.map(m => <div key={m.id} className={`flex ${m.sender_id === user.id ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-2xl px-3 py-2 text-[15px] leading-5 shadow-sm md:max-w-[65%] ${m.sender_id === user.id ? "rounded-br-md bg-[#d9fdd3]" : "rounded-bl-md bg-white"}`}><p className="whitespace-pre-wrap break-words">{m.body}</p><time className="mt-1 block text-right text-[10px] text-[#667781]">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div></div>)}<div ref={bottomRef} className="h-px shrink-0" /></div></div>
          <form onSubmit={e => { e.preventDefault(); void sendMessage(); }} className="shrink-0 border-t border-[#d9dee0] bg-[#f0f2f5] px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:px-4"><div className="mx-auto flex max-w-3xl items-end gap-2"><textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown} rows={1} placeholder="Ketik pesan" className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border-0 bg-white px-4 py-3 text-[15px] leading-5 outline-none focus:ring-0"/><button type="submit" disabled={!text.trim() || busy} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#075e54] text-white disabled:opacity-40" aria-label="Kirim"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none"><path d="M4 4.5 20 12 4 19.5l2.5-6.2L15 12l-8.5-1.3z" fill="currentColor"/></svg></button></div>{error && <p className="mx-auto mt-1 max-w-3xl truncate px-2 text-xs text-red-600">{error}</p>}</form>
        </> : <div className="grid h-full place-items-center bg-[#efeae2] px-6 text-center"><div><Logo /><h2 className="mt-4 text-xl font-bold">Pilih percakapan</h2><p className="mt-1 text-sm text-[#667781]">Cari teman menggunakan @nametag untuk mulai chat.</p></div></div>}
      </section>
    </div>

    {showProfile && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Profil</h2><button onClick={() => setShowProfile(false)} className="text-2xl leading-none text-[#667781]" aria-label="Tutup">×</button></div><div className="mt-6 flex flex-col items-center"><button onClick={() => fileRef.current?.click()} className="relative" aria-label="Ganti foto profil"><Avatar profile={profile} size="lg" /><span className="absolute bottom-0 right-0 rounded-full bg-[#075e54] px-2 py-1 text-xs font-semibold text-white">Ubah</span></button><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) void uploadAvatar(file); e.currentTarget.value = ""; }} /></div><label className="mt-6 block text-sm font-semibold">Nametag<input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0,24))} className="mt-1 h-11 w-full rounded-lg border border-[#d1d7db] px-3 outline-none focus:border-[#075e54]" /></label><label className="mt-4 block text-sm font-semibold">Nama tampilan<input value={displayName} onChange={e => setDisplayName(e.target.value.slice(0,40))} className="mt-1 h-11 w-full rounded-lg border border-[#d1d7db] px-3 outline-none focus:border-[#075e54]" /></label><button disabled={busy} onClick={() => void saveProfile()} className="mt-5 h-11 w-full rounded-lg bg-[#075e54] font-semibold text-white disabled:opacity-50">Simpan profil</button><button onClick={() => void logout()} className="mt-2 h-11 w-full rounded-lg border border-[#d1d7db] font-semibold text-red-600">Keluar</button>{error && <p className="mt-3 text-sm text-red-600">{error}</p>}</section></div>}
  </main>;
}

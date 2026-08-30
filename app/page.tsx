"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "../lib/supabase-browser";

type Profile = { id: string; username: string; display_name: string | null; avatar_url: string | null };
type Contact = Profile;
type Conversation = { id: string; user_a: string; user_b: string; created_at: string; other?: Profile; lastMessage?: string; lastAt?: string };
type Message = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };

function supabase() { return createSupabaseBrowserClient(); }

function Logo({ small = false }: { small?: boolean }) {
  return <div className={`grid shrink-0 place-items-center rounded-full bg-[#075e54] text-white ${small ? "h-9 w-9" : "h-11 w-11"}`} aria-label="Nametag">
    <svg viewBox="0 0 40 40" className={small ? "h-5 w-5" : "h-6 w-6"} fill="none"><path d="M8 9.5h24v17H18l-7 5v-5H8z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="M14 15h12M14 20h7" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>
  </div>;
}

function Avatar({ profile, size = "md" }: { profile?: Profile | null; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-9 w-9 text-xs", md: "h-11 w-11 text-sm", lg: "h-20 w-20 text-2xl" };
  return profile?.avatar_url ? <img src={profile.avatar_url} alt="" className={`${sizes[size]} rounded-full border border-black/10 object-cover`} /> : <div className={`${sizes[size]} grid place-items-center rounded-full bg-[#d8f3dc] font-bold text-[#075e54]`}>{(profile?.display_name || profile?.username || "?")[0].toUpperCase()}</div>;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
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
  const [message, setMessage] = useState("");
  const [mobileChat, setMobileChat] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const callbackError = useMemo(() => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("error") : null, []);

  async function loadProfile(current: User) {
    const sb = supabase();
    const { data } = await sb.from("profiles").select("id, username, display_name, avatar_url").eq("id", current.id).single();
    if (data) { setProfile(data); setUsername(data.username); setDisplayName(data.display_name ?? ""); }
    await loadContacts(current.id);
    await loadConversations(current.id);
  }

  async function loadContacts(userId: string) {
    const sb = supabase();
    const { data } = await sb.from("contacts").select("contact_id").eq("user_id", userId).order("created_at", { ascending: false });
    const ids = (data ?? []).map((x) => x.contact_id);
    if (!ids.length) { setContacts([]); return; }
    const { data: people } = await sb.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
    const ordered = ids.map((id) => (people ?? []).find((p) => p.id === id)).filter(Boolean) as Profile[];
    setContacts(ordered);
  }

  async function loadConversations(userId: string) {
    const sb = supabase();
    const { data } = await sb.from("conversations").select("id, user_a, user_b, created_at").or(`user_a.eq.${userId},user_b.eq.${userId}`).order("created_at", { ascending: false });
    const rows = (data ?? []) as Conversation[];
    const ids = rows.map((r) => r.user_a === userId ? r.user_b : r.user_a);
    let people: Profile[] = [];
    if (ids.length) { const { data } = await sb.from("profiles").select("id, username, display_name, avatar_url").in("id", ids); people = data ?? []; }
    const enriched = rows.map((r) => ({ ...r, other: people.find((p) => p.id === (r.user_a === userId ? r.user_b : r.user_a)) }));
    setConversations(enriched);
    setSelected((current) => current ? enriched.find((x) => x.id === current.id) ?? current : null);
  }

  useEffect(() => {
    let alive = true;
    const sb = supabase();
    sb.auth.getUser().then(async ({ data }) => {
      if (!alive) return;
      setUser(data.user);
      if (data.user) await loadProfile(data.user);
      setLoading(false);
    });
    const { data: auth } = sb.auth.onAuthStateChange(async (_event, session) => {
      if (!alive) return;
      setUser(session?.user ?? null);
      if (session?.user) await loadProfile(session.user);
      else { setProfile(null); setConversations([]); setContacts([]); setSelected(null); }
    });
    return () => { alive = false; auth.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!selected) { setMessages([]); return; }
    const sb = supabase();
    let active = true;
    sb.from("messages").select("id, conversation_id, sender_id, body, created_at").eq("conversation_id", selected.id).order("created_at", { ascending: true }).then(({ data }) => { if (active) setMessages(data ?? []); });
    const channel = sb.channel(`messages:${selected.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selected.id}` }, (payload) => {
      const incoming = payload.new as Message;
      setMessages((old) => old.some((m) => m.id === incoming.id) ? old : [...old, incoming]);
    }).subscribe();
    return () => { active = false; sb.removeChannel(channel); };
  }, [selected?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length, selected?.id]);

  async function login() {
    setMessage("");
    const sb = supabase();
    const redirectTo = `${window.location.origin}/auth/callback?next=/`;
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) setMessage(error.message);
  }

  async function logout() { await supabase().auth.signOut(); setMobileChat(false); }

  async function saveProfile() {
    if (!user || !/^[a-z0-9_]{3,24}$/.test(username)) { setMessage("Nametag harus 3–24 karakter: huruf kecil, angka, atau underscore."); return; }
    setBusy(true); setMessage("");
    const { data, error } = await supabase().from("profiles").update({ username, display_name: displayName.trim() || null }).eq("id", user.id).select("id, username, display_name, avatar_url").single();
    setBusy(false);
    if (error) setMessage(error.code === "23505" ? "Nametag sudah dipakai." : error.message); else { setProfile(data); setShowProfile(false); }
  }

  async function uploadAvatar(file: File) {
    if (!user) return;
    if (!file.type.startsWith("image/")) { setMessage("Pilih file gambar."); return; }
    if (file.size > 5 * 1024 * 1024) { setMessage("Ukuran foto maksimal 5 MB."); return; }
    setBusy(true); setMessage("");
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/avatar.${ext}`;
    const sb = supabase();
    const { error: uploadError } = await sb.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
    if (uploadError) { setBusy(false); setMessage(uploadError.message); return; }
    const { data: publicData } = sb.storage.from("avatars").getPublicUrl(path);
    const avatar_url = `${publicData.publicUrl}?v=${Date.now()}`;
    const { data, error } = await sb.from("profiles").update({ avatar_url }).eq("id", user.id).select("id, username, display_name, avatar_url").single();
    setBusy(false);
    if (error) setMessage(error.message); else setProfile(data);
  }

  async function searchUsers(value: string) {
    setSearch(value);
    if (!value.trim() || !user) { setResults([]); return; }
    const clean = value.trim().replace(/^@/, "").toLowerCase();
    const { data } = await supabase().from("profiles").select("id, username, display_name, avatar_url").ilike("username", `${clean}%`).neq("id", user.id).limit(8);
    setResults(data ?? []);
  }

  async function startChat(other: Profile) {
    if (!user) return;
    setBusy(true); setMessage("");
    const [a, b] = [user.id, other.id].sort();
    const sb = supabase();
    let { data: conv } = await sb.from("conversations").select("id, user_a, user_b, created_at").eq("user_a", a).eq("user_b", b).maybeSingle();
    if (!conv) {
      const created = await sb.from("conversations").insert({ user_a: a, user_b: b }).select("id, user_a, user_b, created_at").single();
      conv = created.data;
      if (created.error) {
        const retry = await sb.from("conversations").select("id, user_a, user_b, created_at").eq("user_a", a).eq("user_b", b).single();
        conv = retry.data;
      }
    }
    setBusy(false);
    if (!conv) { setMessage("Chat tidak dapat dibuat. Coba lagi."); return; }
    const item = { ...(conv as Conversation), other };
    setConversations((old) => [item, ...old.filter((x) => x.id !== item.id)]);
    setSelected(item); setMobileChat(true); setSearch(""); setResults([]);
  }

  async function sendMessage() {
    if (!user || !selected || !text.trim() || busy) return;
    const body = text.trim(); setText("");
    const { error } = await supabase().from("messages").insert({ conversation_id: selected.id, sender_id: user.id, body });
    if (error) { setText(body); setMessage(error.message); }
  }

  async function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); await sendMessage(); }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#efeae2] text-[#111b21]"><div className="text-center"><Logo /><p className="mt-3 text-sm font-semibold">Memuat Nametag...</p></div></main>;

  if (!user) return <main className="min-h-screen bg-[#efeae2] text-[#111b21]">
    <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center p-5 md:p-10">
      <section className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-xl md:p-10">
        <div className="flex items-center gap-3"><Logo /><div><h1 className="text-2xl font-bold tracking-tight">Nametag</h1><p className="text-sm text-gray-500">Private messaging, without phone numbers.</p></div></div>
        <div className="mt-10"><p className="text-sm font-semibold text-[#667781]">WELCOME</p><h2 className="mt-2 text-4xl font-bold tracking-tight">Chat lebih simpel.</h2><p className="mt-4 leading-7 text-[#667781]">Gunakan nametag untuk menemukan teman, lalu kirim pesan secara realtime. Tidak perlu membagikan nomor telepon.</p>
          <button onClick={login} className="mt-8 flex w-full items-center justify-center gap-3 rounded-xl border border-[#d1d7db] bg-white px-5 py-3.5 font-semibold shadow-sm transition hover:bg-gray-50 active:scale-[.99]"><svg viewBox="0 0 24 24" className="h-5 w-5"><path fill="#4285F4" d="M21.35 12.27c0-.72-.06-1.41-.18-2.07H12v3.92h5.24a4.48 4.48 0 0 1-1.95 2.94v2.45h3.16c1.85-1.7 2.9-4.2 2.9-7.24Z"/><path fill="#34A853" d="M12 21.86c2.65 0 4.88-.88 6.51-2.35l-3.16-2.45c-.88.59-2 .94-3.35.94-2.57 0-4.75-1.74-5.53-4.08H3.2v2.53A9.84 9.84 0 0 0 12 21.86Z"/><path fill="#FBBC05" d="M6.47 13.92a5.92 5.92 0 0 1 0-3.84V7.55H3.2a9.9 9.9 0 0 0 0 8.9l3.27-2.53Z"/><path fill="#EA4335" d="M12 6c1.44 0 2.73.5 3.75 1.48l2.81-2.81C16.87 3.02 14.65 2.14 12 2.14a9.84 9.84 0 0 0-8.8 5.41l3.27 2.53C7.22 7.74 9.4 6 12 6Z"/></svg>Continue with Google</button>
          {(message || callbackError) && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{message || "Login Google gagal. Coba lagi."}</p>}
        </div>
      </section>
    </div>
  </main>;

  return <main className="min-h-screen bg-[#efeae2] text-[#111b21]">
    <div className="mx-auto flex h-screen max-w-[1500px] overflow-hidden bg-white shadow-xl">
      <aside className={`${mobileChat ? "hidden md:flex" : "flex"} w-full flex-col border-r border-[#d9dee0] md:w-[390px]`}>
        <header className="flex items-center justify-between bg-[#f0f2f5] px-5 py-3">
          <div className="flex items-center gap-3"><Logo small /><div><p className="font-bold">Nametag</p><p className="text-xs text-[#667781]">@{profile?.username}</p></div></div>
          <div className="flex gap-1"><button aria-label="Profile" onClick={() => setShowProfile(true)} className="rounded-full p-2.5 hover:bg-[#e2e5e8]"><svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c.8-3.2 2.9-5 6.5-5s5.7 1.8 6.5 5"/></svg></button><button aria-label="Log out" onClick={logout} className="rounded-full p-2.5 hover:bg-[#e2e5e8]"><svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2"><path d="M10 5H5v14h5M14 8l4 4-4 4M9 12h9"/></svg></button></div>
        </header>
        <div className="border-b border-[#e9edef] bg-white p-3"><div className="flex items-center gap-2 rounded-lg bg-[#f0f2f5] px-3 py-2"><svg viewBox="0 0 24 24" className="h-4 w-4 text-[#667781]" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input value={search} onChange={(e) => searchUsers(e.target.value)} placeholder="Search nametag" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div></div>
        {results.length > 0 && <div className="border-b border-[#e9edef] bg-white p-2">{results.map((person) => <button key={person.id} onClick={() => startChat(person)} className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-[#f5f6f6]"><Avatar profile={person}/><div><p className="font-semibold">{person.display_name || `@${person.username}`}</p><p className="text-sm text-[#667781]">@{person.username}</p></div></button>)}</div>}
        <div className="flex-1 overflow-y-auto">{conversations.map((conv) => <button key={conv.id} onClick={() => { setSelected(conv); setMobileChat(true); }} className={`flex w-full items-center gap-3 border-b border-[#e9edef] px-4 py-3.5 text-left hover:bg-[#f5f6f6] ${selected?.id === conv.id ? "bg-[#f0f2f5]" : "bg-white"}`}><Avatar profile={conv.other}/><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate font-semibold">{conv.other?.display_name || `@${conv.other?.username}`}</p>{conv.lastAt && <span className="text-[11px] text-[#667781]">{new Date(conv.lastAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}</div><p className="truncate text-sm text-[#667781]">@{conv.other?.username}</p></div></button>)}{!conversations.length && <div className="p-8 text-center"><p className="font-semibold">Belum ada chat</p><p className="mt-1 text-sm leading-6 text-[#667781]">Cari nametag teman di kotak pencarian untuk memulai percakapan.</p></div>}</div>
      </aside>

      <section className={`${mobileChat ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col bg-[#efeae2]`}>
        {selected?.other ? <>
          <header className="flex items-center gap-3 border-b border-[#d9dee0] bg-[#f0f2f5] px-4 py-2.5"><button onClick={() => setMobileChat(false)} className="rounded-full p-2 hover:bg-[#e2e5e8] md:hidden" aria-label="Back"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg></button><Avatar profile={selected.other} size="sm"/><div><p className="font-semibold">{selected.other.display_name || `@${selected.other.username}`}</p><p className="text-xs text-[#667781]">@{selected.other.username}</p></div></header>
          <div className="flex-1 overflow-y-auto p-4 md:p-6"><div className="mx-auto flex max-w-4xl flex-col gap-1.5">{messages.map((m) => { const mine = m.sender_id === user.id; return <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[82%] rounded-lg px-3 py-2 shadow-sm md:max-w-[65%] ${mine ? "bg-[#d9fdd3]" : "bg-white"}`}><p className="whitespace-pre-wrap break-words text-[14px] leading-5">{m.body}</p><p className="mt-1 text-right text-[10px] text-[#667781]">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></div></div>; })}<div ref={bottomRef}/></div></div>
          <div className="bg-[#f0f2f5] p-3"><div className="mx-auto flex max-w-4xl items-end gap-2"><textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown} rows={1} maxLength={4000} placeholder="Ketik pesan" className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border-0 bg-white px-4 py-3 text-sm outline-none"/><button onClick={sendMessage} disabled={!text.trim() || busy} aria-label="Send message" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#075e54] text-white transition hover:bg-[#064e46] disabled:cursor-not-allowed disabled:opacity-40"><svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2"><path d="m4 4 17 8-17 8 3-8z"/><path d="M7 12h8"/></svg></button></div></div>
        </> : <div className="grid flex-1 place-items-center p-8 text-center"><div><Logo/><h2 className="mt-5 text-2xl font-semibold">Nametag Chat</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#667781]">Pilih chat dari daftar atau cari nametag untuk memulai percakapan realtime.</p></div></div>}
      </section>
    </div>

    {showProfile && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowProfile(false); }}><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Profile</h2><button onClick={() => setShowProfile(false)} className="rounded-full p-2 hover:bg-gray-100" aria-label="Close"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div className="mt-6 flex flex-col items-center"><button onClick={() => fileRef.current?.click()} disabled={busy} className="group relative rounded-full" aria-label="Change profile photo"><Avatar profile={profile} size="lg"/><span className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full bg-[#075e54] text-white"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h4l1.5-2h5L16 7h4v11H4z"/><circle cx="12" cy="13" r="3"/></svg></span></button><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadAvatar(file); e.currentTarget.value = ""; }}/><p className="mt-2 text-xs text-[#667781]">Pilih foto dari galeri · maksimal 5 MB</p></div><div className="mt-7 space-y-4"><label className="block"><span className="text-xs font-semibold uppercase tracking-wide text-[#667781]">Nametag</span><input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} maxLength={24} className="mt-1 w-full border-b-2 border-[#d9dee0] px-1 py-2 outline-none focus:border-[#075e54]"/></label><label className="block"><span className="text-xs font-semibold uppercase tracking-wide text-[#667781]">Nama tampilan</span><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} className="mt-1 w-full border-b-2 border-[#d9dee0] px-1 py-2 outline-none focus:border-[#075e54]"/></label><button disabled={busy} onClick={saveProfile} className="w-full rounded-lg bg-[#075e54] px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Menyimpan..." : "Simpan perubahan"}</button><button onClick={logout} className="w-full rounded-lg border border-[#d9dee0] px-4 py-3 font-semibold text-[#b42318]">Log out</button></div>{message && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}</div></div>}
  </main>;
}

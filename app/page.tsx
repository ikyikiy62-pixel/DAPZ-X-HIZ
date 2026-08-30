"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "../lib/supabase-browser";

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

type Contact = Profile & { created_at?: string };

const supabase = createSupabaseBrowserClient();

function Logo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-10 w-10" fill="none">
      <rect x="3" y="3" width="42" height="42" stroke="currentColor" strokeWidth="5" />
      <path d="M12 32 20 12l8 20 8-20" stroke="currentColor" strokeWidth="5" strokeLinejoin="miter" />
      <path d="M15 30h18" stroke="currentColor" strokeWidth="5" />
    </svg>
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const callbackError = useMemo(() => {
    if (typeof window === "undefined") return "";
    const error = new URLSearchParams(window.location.search).get("error");
    return error ? "Google login gagal. Coba lagi." : "";
  }, []);

  async function loadProfile(currentUser: User) {
    const { data, error } = await supabase.from("profiles").select("id, username, display_name, avatar_url").eq("id", currentUser.id).single();
    if (error) {
      setMessage("Profile belum tersedia. Coba refresh sekali.");
      return;
    }
    setProfile(data);
    setUsername(data.username);
    setDisplayName(data.display_name ?? "");
    const { data: contactRows } = await supabase
      .from("contacts")
      .select("created_at, contact:profiles!contacts_contact_id_fkey(id, username, display_name, avatar_url)")
      .order("created_at", { ascending: false });
    setContacts((contactRows ?? []).map((row: any) => ({ ...row.contact, created_at: row.created_at })).filter(Boolean));
  }

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(async ({ data: { user: currentUser } }) => {
      if (!mounted) return;
      setUser(currentUser);
      if (currentUser) await loadProfile(currentUser);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      if (session?.user) await loadProfile(session.user);
      else setProfile(null);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  async function login() {
    setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/` },
    });
    if (error) setMessage(error.message);
  }

  async function logout() {
    await supabase.auth.signOut();
    setContacts([]);
    setResults([]);
  }

  async function saveProfile() {
    if (!user || !/^[a-z0-9_]{3,24}$/.test(username)) {
      setMessage("Nametag harus 3–24 karakter: huruf kecil, angka, atau underscore.");
      return;
    }
    setSaving(true); setMessage("");
    const { error } = await supabase.from("profiles").update({ username, display_name: displayName.trim() || null }).eq("id", user.id);
    setSaving(false);
    setMessage(error ? (error.code === "23505" ? "Nametag sudah dipakai." : error.message) : "Profile tersimpan.");
    if (!error) setProfile((p) => p ? { ...p, username, display_name: displayName.trim() || null } : p);
  }

  async function searchUsers(value: string) {
    setSearch(value);
    if (!value.trim()) { setResults([]); return; }
    const clean = value.trim().replace(/^@/, "").toLowerCase();
    const { data } = await supabase.from("profiles").select("id, username, display_name, avatar_url").ilike("username", `${clean}%`).neq("id", user?.id ?? "").limit(8);
    setResults(data ?? []);
  }

  async function addContact(contactId: string) {
    if (!user) return;
    const { error } = await supabase.from("contacts").insert({ user_id: user.id, contact_id: contactId });
    if (error && error.code !== "23505") { setMessage(error.message); return; }
    setMessage("Contact ditambahkan.");
    await loadProfile(user);
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f1f1ef] font-mono font-bold">LOADING...</main>;

  if (!user) return (
    <main className="min-h-screen bg-[#f1f1ef] p-5 text-black md:p-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between border-b-4 border-black pb-5">
          <div className="flex items-center gap-3"><Logo /><span className="text-2xl font-black tracking-tight">NAMETAG</span></div>
          <span className="border-4 border-black bg-[#b8f2d0] px-3 py-2 font-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">PHASE 01</span>
        </header>
        <section className="mt-14 grid gap-8 md:grid-cols-[1.4fr_.6fr]">
          <div className="border-4 border-black bg-[#ffe45c] p-7 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] md:p-12">
            <p className="mb-4 font-mono text-sm font-black">REALTIME MESSENGER</p>
            <h1 className="text-5xl font-black leading-[.95] md:text-7xl">CHAT TANPA NOMOR.</h1>
            <p className="mt-7 max-w-xl text-lg font-bold">Masuk dengan Google, pilih nametag unik, lalu temukan teman tanpa membagikan nomor telepon.</p>
            <button onClick={login} className="mt-8 border-4 border-black bg-white px-6 py-4 font-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-[2px] active:translate-y-[2px] active:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">CONTINUE WITH GOOGLE</button>
            {(message || callbackError) && <p className="mt-5 border-4 border-black bg-[#ff9f7a] p-3 font-bold">{message || callbackError}</p>}
          </div>
          <div className="border-4 border-black bg-[#b8f2d0] p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <p className="font-mono text-sm font-black">PHASE 01</p>
            <ul className="mt-5 space-y-3 font-black"><li>01 / GOOGLE AUTH</li><li>02 / UNIQUE NAMETAG</li><li>03 / USER SEARCH</li><li>04 / CONTACTS</li><li>05 / PROFILE</li></ul>
          </div>
        </section>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen bg-[#f1f1ef] p-4 text-black md:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b-4 border-black pb-5">
          <div className="flex items-center gap-3"><Logo /><div><div className="text-2xl font-black">NAMETAG</div><div className="font-mono text-xs font-bold">MESSENGER / PHASE 01</div></div></div>
          <button onClick={logout} className="border-4 border-black bg-white px-4 py-2 font-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">LOG OUT</button>
        </header>

        <section className="mt-7 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
          <div className="border-4 border-black bg-[#ffe45c] p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <p className="font-mono text-xs font-black">YOUR PROFILE</p>
            <div className="mt-5 flex items-center gap-4">
              <div className="grid h-16 w-16 place-items-center border-4 border-black bg-white text-xl font-black">{(profile?.username[0] ?? "?").toUpperCase()}</div>
              <div><div className="text-2xl font-black">@{profile?.username}</div><div className="font-bold">{profile?.display_name || "No display name"}</div></div>
            </div>
            <div className="mt-6 space-y-3">
              <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} maxLength={24} placeholder="nametag" className="w-full border-4 border-black bg-white px-3 py-3 font-bold outline-none" />
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} placeholder="display name" className="w-full border-4 border-black bg-white px-3 py-3 font-bold outline-none" />
              <button disabled={saving} onClick={saveProfile} className="w-full border-4 border-black bg-black px-4 py-3 font-black text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50">{saving ? "SAVING..." : "SAVE PROFILE"}</button>
            </div>
          </div>

          <div className="border-4 border-black bg-[#b8f2d0] p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            <p className="font-mono text-xs font-black">FIND PEOPLE</p>
            <div className="mt-4 flex gap-3"><input value={search} onChange={(e) => searchUsers(e.target.value)} placeholder="Search @nametag" className="min-w-0 flex-1 border-4 border-black bg-white px-3 py-3 font-bold outline-none" /><span className="grid place-items-center border-4 border-black bg-white px-3 font-black">SEARCH</span></div>
            <div className="mt-4 space-y-3">{results.map((result) => <div key={result.id} className="flex items-center justify-between border-4 border-black bg-white p-3"><div><div className="font-black">@{result.username}</div><div className="text-sm font-bold">{result.display_name || "No display name"}</div></div><button onClick={() => addContact(result.id)} className="border-4 border-black bg-[#ff9f7a] px-3 py-2 font-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">ADD</button></div>)}{search && !results.length && <p className="border-4 border-black bg-white p-3 font-bold">No matching nametag.</p>}</div>
          </div>
        </section>

        <section className="mt-6 border-4 border-black bg-white p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-between"><h2 className="text-2xl font-black">CONTACTS</h2><span className="border-4 border-black bg-[#ffe45c] px-3 py-1 font-black">{contacts.length}</span></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">{contacts.map((contact) => <button key={contact.id} className="flex items-center gap-3 border-4 border-black bg-[#f1f1ef] p-4 text-left hover:bg-[#b8f2d0]"><div className="grid h-11 w-11 shrink-0 place-items-center border-4 border-black bg-white font-black">{contact.username[0].toUpperCase()}</div><div><div className="font-black">@{contact.username}</div><div className="text-sm font-bold">{contact.display_name || "No display name"}</div></div></button>)}{!contacts.length && <p className="border-4 border-black bg-[#ff9f7a] p-4 font-bold md:col-span-2">Belum ada contact. Cari nametag di atas untuk mulai.</p>}</div>
        </section>
        {message && <p className="mt-5 border-4 border-black bg-white p-3 font-bold">{message}</p>}
      </div>
    </main>
  );
}

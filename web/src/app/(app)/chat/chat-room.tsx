"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

type Msg = {
  id: number;
  member_id: string | null;
  member_name: string | null;
  body: string;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  deleted_at: string | null;
};
export type RoomLink = { id: number; kind: string; title: string; unread: number; people: number };

const MAX_FILE = 25 * 1024 * 1024;

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
function day(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

/** Text with web links made clickable. Everything else stays plain text, so nothing can run. */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** Sends a file straight to storage with a one time link, reporting progress. */
function put(url: string, file: File, onProgress: (n: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.setRequestHeader("content-type", file.type || "application/octet-stream");
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    x.onload = () => (x.status < 300 ? resolve() : reject(new Error("Upload failed.")));
    x.onerror = () => reject(new Error("Upload failed. Check your connection."));
    x.send(file);
  });
}

export function ChatRoom({ roomId, meId, title, subtitle, rooms: initialRooms, side, tools }: { roomId: number; meId: string; title: string; subtitle: string; rooms: RoomLink[]; side: ReactNode; tools: ReactNode }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [more, setMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [rooms, setRooms] = useState(initialRooms);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastId = useRef(0);
  const stick = useRef(true);

  const merge = useCallback((items: Msg[]) => {
    if (!items.length) return;
    setMsgs((old) => {
      const byId = new Map(old.map((m) => [m.id, m]));
      for (const m of items) byId.set(m.id, m);
      return [...byId.values()].sort((a, b) => a.id - b.id);
    });
    lastId.current = Math.max(lastId.current, ...items.map((m) => m.id));
  }, []);

  // First page, then new messages every 2 seconds while the tab is open (every 10 when hidden).
  useEffect(() => {
    let stop = false;
    let timer: number | undefined;
    // The page gives each room its own key, so state starts fresh per room.
    lastId.current = 0;
    const tick = async () => {
      try {
        const r = await fetch(`/api/chat/messages?room=${roomId}${lastId.current ? `&after=${lastId.current}` : ""}`, { cache: "no-store" });
        if (r.ok) {
          const d = (await r.json()) as { items: Msg[]; more: boolean };
          if (!lastId.current) setMore(d.more);
          merge(d.items);
          setLoaded(true);
        }
      } catch {
        // Offline for a moment: try again on the next tick.
      }
      if (!stop) timer = window.setTimeout(tick, document.visibilityState === "visible" ? 2000 : 10000);
    };
    tick();
    const wake = () => {
      if (document.visibilityState === "visible") {
        window.clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      stop = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [roomId, merge]);

  // Unread counts for the other rooms, every 5 seconds, and in the tab title.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, "");
    const t = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/chat/rooms", { cache: "no-store" });
        if (r.ok) setRooms(((await r.json()) as { rooms: RoomLink[] }).rooms);
      } catch {
        // Try again later.
      }
    }, 5000);
    return () => {
      window.clearInterval(t);
      document.title = base;
    };
  }, []);
  useEffect(() => {
    const n = rooms.filter((r) => r.id !== roomId).reduce((a, r) => a + r.unread, 0);
    document.title = `${n ? `(${n}) ` : ""}${document.title.replace(/^\(\d+\) /, "")}`;
  }, [rooms, roomId]);

  // Stay at the bottom when new messages come in, unless you scrolled up to read.
  useLayoutEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const older = async () => {
    const first = msgs[0]?.id;
    if (!first) return;
    const el = list.current;
    const before = el?.scrollHeight ?? 0;
    const r = await fetch(`/api/chat/messages?room=${roomId}&before=${first}`, { cache: "no-store" });
    if (!r.ok) return;
    const d = (await r.json()) as { items: Msg[]; more: boolean };
    stick.current = false;
    setMsgs((old) => [...d.items, ...old]);
    setMore(d.more);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - before;
    });
  };

  const pick = (f: File | null | undefined) => {
    setError("");
    if (!f) return;
    if (f.size > MAX_FILE) return setError("Files can be up to 25 MB.");
    if (f.size === 0) return setError("That file is empty.");
    setFile(f);
    box.current?.focus();
  };

  const send = async () => {
    const body = text.trim();
    if ((!body && !file) || sending) return;
    setSending(true);
    setError("");
    try {
      let attached: { path: string; name: string; type: string; size: number } | undefined;
      if (file) {
        const a = await fetch("/api/chat/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ room: roomId, name: file.name, size: file.size }) });
        const ad = await a.json().catch(() => ({ error: "Could not upload. Try again." }));
        if (!a.ok) throw new Error(ad.error ?? "Could not upload.");
        setProgress(0);
        await put(ad.url, file, setProgress);
        attached = { path: ad.path, name: file.name.slice(0, 200), type: file.type || "application/octet-stream", size: file.size };
      }
      const r = await fetch("/api/chat/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ room: roomId, body, file: attached }) });
      const d = await r.json().catch(() => ({ error: "Could not send. Try again." }));
      if (!r.ok) throw new Error(d.error ?? "Could not send.");
      stick.current = true;
      merge([d.item]);
      setText("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
      setProgress(null);
      box.current?.focus();
    }
  };

  const remove = async (id: number) => {
    if (confirmId !== id) return setConfirmId(id);
    setConfirmId(null);
    try {
      const r = await fetch(`/api/chat/messages?id=${id}`, { method: "DELETE" });
      if (r.ok) setMsgs((old) => old.map((m) => (m.id === id ? { ...m, deleted_at: new Date().toISOString(), body: "", file_name: null } : m)));
      else setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Could not delete. Try again.");
    } catch {
      setError("Could not delete. Check your connection.");
    }
  };

  return (
    <div className="grid h-[calc(100dvh-8rem)] min-h-[480px] grid-cols-1 overflow-hidden rounded-2xl border border-border bg-background lg:h-[calc(100dvh-4rem)] lg:grid-cols-[300px_1fr]">
      <aside className="hidden min-h-0 flex-col border-r border-border lg:flex">
        <nav aria-label="Chats" className="min-h-0 flex-1 overflow-y-auto p-2">
          <RoomList rooms={rooms} active={roomId} />
        </nav>
        <div className="border-t border-border p-3">{side}</div>
      </aside>

      <section
        className={`relative flex min-h-0 min-w-0 flex-col ${dragging ? "ring-2 ring-primary ring-inset" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0]);
        }}
      >
        <header className="flex min-h-16 items-center justify-between gap-3 border-b border-border px-4 py-2">
          <div className="min-w-0">
            <Link href="/chat?list=1" className="mb-0.5 block text-[13px] text-primary lg:hidden">
              All chats
            </Link>
            <h2 className="truncate text-[17px] font-semibold">{title}</h2>
            <p className="truncate text-[13px] text-muted-foreground">{subtitle}</p>
          </div>
          {tools}
        </header>

        <div
          ref={list}
          className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5"
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          aria-live="polite"
        >
          {more ? (
            <div className="mb-3 text-center">
              <button onClick={older} className="rounded-full border border-border px-4 py-1.5 text-[13px] hover:bg-muted">
                Show earlier messages
              </button>
            </div>
          ) : null}
          {!loaded ? <p className="text-center text-[14px] text-muted-foreground">Loading...</p> : null}
          {loaded && !msgs.length ? <p className="mt-10 text-center text-[15px] text-muted-foreground">No messages yet. Say hello.</p> : null}
          {msgs.map((m, i) => {
            const prev = msgs[i - 1];
            const newDay = !prev || day(prev.created_at) !== day(m.created_at);
            const mine = m.member_id === meId;
            const system = m.member_id === null;
            const grouped = !newDay && prev && prev.member_id === m.member_id && !system && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
            return (
              <div key={m.id}>
                {newDay ? (
                  <p className="my-3 text-center text-[12px] font-medium text-muted-foreground">
                    <span className="rounded-full bg-muted px-3 py-1">{day(m.created_at)}</span>
                  </p>
                ) : null}
                {system ? (
                  <p className="my-2 text-center text-[13px] text-muted-foreground">{m.body}</p>
                ) : (
                  <div className={`group flex ${mine ? "justify-end" : "justify-start"} ${grouped ? "mt-0.5" : "mt-3"}`}>
                    <div className={`max-w-[85%] sm:max-w-[70%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                      {!grouped && !mine ? <p className="mb-0.5 px-1 text-[12.5px] font-semibold">{m.member_name ?? "Former member"}</p> : null}
                      {m.deleted_at ? (
                        <p className="rounded-2xl border border-dashed border-border px-3 py-2 text-[14px] text-muted-foreground italic">Message deleted</p>
                      ) : (
                        <div className={`rounded-2xl px-3 py-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                          {m.file_name ? <FileCard m={m} mine={mine} /> : null}
                          {m.body ? <Linked text={m.body} /> : null}
                        </div>
                      )}
                      <p className="mt-0.5 flex gap-2 px-1 text-[11.5px] text-muted-foreground">
                        <span>{time(m.created_at)}</span>
                        {mine && !m.deleted_at ? (
                          <button onClick={() => remove(m.id)} onBlur={() => setConfirmId(null)} className={`hover:text-danger ${confirmId === m.id ? "font-semibold text-danger" : "sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"}`}>
                            {confirmId === m.id ? "Tap again to delete" : "Delete"}
                          </button>
                        ) : null}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <form
          className="border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {error ? <p className="mb-2 text-[13px] text-danger">{error}</p> : null}
          {file ? (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-border bg-muted px-3 py-2 text-[14px]">
              <span className="min-w-0 truncate">
                {file.name} <span className="text-muted-foreground">({size(file.size)})</span>
                {progress !== null ? <span className="ml-2 text-primary">{progress}%</span> : null}
              </span>
              <button type="button" onClick={() => setFile(null)} disabled={sending} className="shrink-0 text-[13px] font-medium text-danger">
                Remove
              </button>
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <input ref={fileInput} type="file" className="sr-only" id="chat-file" onChange={(e) => pick(e.target.files?.[0])} />
            <label htmlFor="chat-file" className="inline-flex h-11 shrink-0 cursor-pointer items-center rounded-xl border border-border px-3 text-[14px] font-medium hover:bg-muted">
              Attach
            </label>
            <label htmlFor="chat-text" className="sr-only">
              Message
            </label>
            <textarea
              id="chat-text"
              ref={box}
              value={text}
              rows={1}
              maxLength={4000}
              placeholder="Write a message"
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              onPaste={(e) => {
                const f = e.clipboardData.files?.[0];
                if (f) {
                  e.preventDefault();
                  pick(f);
                }
              }}
              className="max-h-40 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-[15px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button disabled={sending || (!text.trim() && !file)} className="h-11 shrink-0 rounded-xl bg-primary px-4 text-[15px] font-medium text-primary-foreground disabled:opacity-50">
              {sending ? "Sending" : "Send"}
            </button>
          </div>
          <p className="mt-1.5 hidden text-[12px] text-muted-foreground sm:block">Enter sends, Shift and Enter for a new line. Drop or paste a file to attach it, up to 25 MB.</p>
        </form>
      </section>
    </div>
  );
}

function FileCard({ m, mine }: { m: Msg; mine: boolean }) {
  const href = `/api/chat/file/${m.id}`;
  if (/^image\/(png|jpe?g|gif|webp|avif)$/.test(m.file_type ?? "")) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="mb-1 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={href} alt={m.file_name ?? "Picture"} loading="lazy" className="max-h-64 max-w-full rounded-xl object-contain" />
      </a>
    );
  }
  return (
    <a href={`${href}?download=1`} className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2 ${mine ? "bg-white/15" : "bg-background"}`}>
      <span className="min-w-0">
        <span className="block truncate font-medium">{m.file_name}</span>
        <span className={`block text-[12px] ${mine ? "text-white/80" : "text-muted-foreground"}`}>{m.file_size ? size(m.file_size) : "File"}, download</span>
      </span>
    </a>
  );
}

export function RoomList({ rooms, active }: { rooms: RoomLink[]; active?: number }) {
  return (
    <ul className="space-y-1">
      {rooms.map((r) => (
        <li key={r.id}>
          <Link
            href={`/chat?room=${r.id}`}
            aria-current={r.id === active ? "page" : undefined}
            className={`flex min-h-[48px] items-center justify-between gap-2 rounded-xl px-3 py-2 ${r.id === active ? "bg-brand text-white" : "hover:bg-muted"}`}
          >
            <span className="min-w-0">
              <span className={`block truncate text-[15px] ${r.unread ? "font-semibold" : "font-medium"}`}>{r.title}</span>
              <span className={`block truncate text-[12px] ${r.id === active ? "text-white/80" : "text-muted-foreground"}`}>
                {r.kind === "direct" ? "Direct message" : r.kind === "everyone" ? "Whole team" : `Group, ${r.people} people`}
              </span>
            </span>
            {r.unread ? <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums ${r.id === active ? "bg-white text-primary" : "bg-primary text-white"}`}>{r.unread}</span> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

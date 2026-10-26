"use client";

import { useRef, useState } from "react";
import { buttonClass } from "@/components/ui/button";

/** Copies one value, like an account number, and says so for a moment. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("secondary", "sm", "shrink-0")}
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
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

/**
 * Picks a file and uploads it as soon as it is chosen, so big pitch decks never pass through our server.
 * The form only gets the stored path, and cannot be saved while the upload is running.
 */
export function FileField({ id, current }: { id: string; current?: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ path: string; name: string; type: string; size: number } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [remove, setRemove] = useState(false);

  async function pick(file: File | undefined) {
    const el = input.current;
    setError("");
    setState(null);
    if (!file || !el) return;
    if (file.size > 50 * 1024 * 1024) {
      setError("Files can be up to 50 MB.");
      el.value = "";
      return;
    }
    el.setCustomValidity("Wait for the upload to finish.");
    setProgress(0);
    try {
      const a = await fetch("/api/resources/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size }) });
      const ad = await a.json().catch(() => ({ error: "Could not upload. Try again." }));
      if (!a.ok) throw new Error(ad.error ?? "Could not upload.");
      await put(ad.url, file, setProgress);
      setState({ path: ad.path, name: file.name, type: file.type, size: file.size });
      el.setCustomValidity("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload.");
      el.value = "";
      el.setCustomValidity("");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div>
      <input
        ref={input}
        id={id}
        type="file"
        onChange={(e) => pick(e.target.files?.[0])}
        className="block w-full text-[15px] file:mr-3 file:h-11 file:cursor-pointer file:rounded-xl file:border file:border-border file:bg-background file:px-4 file:text-[15px] file:font-medium hover:file:bg-muted"
      />
      {state ? (
        <>
          <input type="hidden" name="file_path" value={state.path} />
          <input type="hidden" name="file_name" value={state.name} />
          <input type="hidden" name="file_type" value={state.type} />
          <input type="hidden" name="file_size" value={state.size} />
        </>
      ) : null}
      <p className="mt-1.5 text-[13px] text-muted-foreground" aria-live="polite">
        {progress !== null ? `Uploading ${progress}%` : error ? <span className="text-red-600">{error}</span> : state ? "Uploaded. Save to keep it." : current ? `Now: ${current}. Pick a file to replace it.` : "PDF, slides, pictures, anything up to 50 MB."}
      </p>
      {current && !state ? (
        <label className="mt-2 flex min-h-[36px] items-center gap-2 text-[14px]">
          <input type="checkbox" name="remove_file" checked={remove} onChange={(e) => setRemove(e.target.checked)} className="size-5 accent-primary" />
          Remove the current file
        </label>
      ) : null}
    </div>
  );
}

import "server-only";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DATA = path.join(/* turbopackIgnore: true */ process.cwd(), "data");
const STATUS = path.join(DATA, "linkedin-status.json");
const LOG = path.join(DATA, "linkedin.log");
const SCRIPT = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "linkedin.mjs");

export type LinkedInStatus = {
  state?: "signing-in" | "signed-in" | "signed-out" | "checking" | "blocked" | "error";
  error?: string | null;
  pid?: number | null;
  auto?: boolean;
  pagesToday?: number;
  day?: string;
  pausedUntil?: number;
  nextRun?: string;
  lastRun?: { at: string; pages: number; posts: number; added: number; profiles: number };
};

export function readStatus(): LinkedInStatus {
  try {
    return JSON.parse(fs.readFileSync(STATUS, "utf8"));
  } catch {
    return {};
  }
}

export function isAlive(pid?: number | null) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function workerRunning() {
  return isAlive(readStatus().pid);
}

export function startWorker(mode: "login" | "once" | "run") {
  fs.mkdirSync(DATA, { recursive: true });
  const out = fs.openSync(LOG, "a");
  const child = spawn(process.execPath, [SCRIPT, mode], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", out, out],
    env: { ...process.env, APP_URL: process.env.APP_URL || "http://localhost:3000" },
  });
  child.unref();
}

export function stopWorker() {
  const s = readStatus();
  if (isAlive(s.pid)) process.kill(s.pid!, "SIGTERM");
}

export function lastLogLines(n = 8) {
  try {
    return fs.readFileSync(LOG, "utf8").trim().split("\n").slice(-n).join("\n");
  } catch {
    return "";
  }
}

export type ExtensionStatus = {
  version: string;
  linkedin: "signed-in" | "signed-out";
  watch: boolean;
  pagesToday: number;
  dailyCap: number;
  lastWatch: { at: number; pages: number; added: number; profiles?: number } | null;
  pausedUntil: number;
  lastError: string;
  seenAt: string;
};

export async function readExtensionStatus(): Promise<ExtensionStatus | null> {
  const { sb } = await import("./db");
  const r = await sb().from("settings").select("value").eq("key", "extension_status").maybeSingle();
  if (r.error || !r.data) return null;
  try {
    return JSON.parse(r.data.value);
  } catch {
    return null;
  }
}

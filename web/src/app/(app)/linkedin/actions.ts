"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { startWorker, stopWorker, workerRunning } from "@/lib/linkedin-worker";
import { requireMember } from "@/lib/session";

function done(msg: string, kind: "ok" | "error" = "ok"): never {
  revalidatePath("/linkedin");
  redirect(`/linkedin?${kind}=${encodeURIComponent(msg)}`);
}

export async function signIn() {
  await requireMember("admin");
  if (workerRunning()) done("Stop the auto check first. Chrome can only open this profile once.", "error");
  startWorker("login");
  done("A Chrome window is opening. Sign in to LinkedIn there. It closes by itself when you are in.");
}

export async function startAuto() {
  await requireMember("admin");
  if (workerRunning()) done("The auto check is already running.", "error");
  startWorker("run");
  done("Auto check started. The first check runs now, then every 30 minutes.");
}

export async function runOnce() {
  await requireMember("admin");
  if (workerRunning()) done("A check is already running.", "error");
  startWorker("once");
  done("Checking now. New leads show up in the inbox in a few minutes.");
}

export async function stopAuto() {
  await requireMember("admin");
  stopWorker();
  done("Auto check stopped.");
}

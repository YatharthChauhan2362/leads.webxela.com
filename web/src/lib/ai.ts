import "server-only";
import type { z } from "zod";

const BASE = process.env.AI_BASE_URL ?? "https://ai.yatricloud.com/v1";
const KEY = process.env.AI_API_KEY;
const MODEL = process.env.AI_MODEL ?? "claude-sonnet-5-5";

export function aiEnabled() {
  return Boolean(KEY);
}

async function chat(system: string, user: string, json: boolean): Promise<string> {
  const res = await fetch(`${BASE.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      ...(json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

export async function aiJson<T>(system: string, user: string, schema: z.ZodType<T>): Promise<T> {
  const raw = await chat(system, user, true);
  const body = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  return schema.parse(JSON.parse(body));
}

export async function aiText(system: string, user: string): Promise<string> {
  return (await chat(system, user, false)).trim();
}

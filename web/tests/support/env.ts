// Integration tests talk to the real database, so they read .env.local. Unit tests never need it.
import { existsSync, readFileSync } from "node:fs";

const file = new URL("../../.env.local", import.meta.url);
if (existsSync(file)) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

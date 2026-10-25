import "server-only";

// Sign in with Google or Zoho using the standard OAuth code flow. We only ask for name and email.
export type Provider = "google" | "zoho";

const ZOHO = process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.in";

export function appUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function redirectUri(p: Provider) {
  return `${appUrl()}/auth/${p}/callback`;
}

export function providerEnabled(p: Provider) {
  return p === "google"
    ? Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    : Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET);
}

export function authorizeUrl(p: Provider, state: string) {
  if (p === "google") {
    const q = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri(p),
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  const q = new URLSearchParams({
    client_id: process.env.ZOHO_CLIENT_ID!,
    redirect_uri: redirectUri(p),
    response_type: "code",
    scope: "AaaServer.profile.Read",
    access_type: "online",
    prompt: "consent",
    state,
  });
  return `${ZOHO}/oauth/v2/auth?${q}`;
}

export type OAuthUser = { email: string; name: string | null; avatar: string | null };

export async function exchangeCode(p: Provider, code: string, zohoServer?: string | null): Promise<OAuthUser> {
  if (p === "google") {
    const tok = await post("https://oauth2.googleapis.com/token", {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(p),
      grant_type: "authorization_code",
    });
    const info = await getJson("https://openidconnect.googleapis.com/v1/userinfo", tok.access_token);
    if (!info.email || info.email_verified === false) throw new Error("Google did not share a verified email.");
    return { email: String(info.email).toLowerCase(), name: info.name ?? null, avatar: info.picture ?? null };
  }
  // Only Zoho India (accounts.zoho.in, or ZOHO_ACCOUNTS_URL) for now. Accounts from other Zoho regions are not used.
  void zohoServer;
  const base = ZOHO;
  const tok = await post(`${base}/oauth/v2/token`, {
    code,
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    redirect_uri: redirectUri(p),
    grant_type: "authorization_code",
  });
  const info = await getJson(`${base}/oauth/user/info`, tok.access_token, "Zoho-oauthtoken");
  if (!info.Email) throw new Error("Zoho did not share an email.");
  return { email: String(info.Email).toLowerCase(), name: info.Display_Name ?? info.First_Name ?? null, avatar: null };
}

async function post(url: string, body: Record<string, string>) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body), signal: AbortSignal.timeout(15_000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(json.error_description || json.error || `Sign in failed (${res.status}).`);
  return json as { access_token: string };
}

async function getJson(url: string, token: string, scheme = "Bearer") {
  const res = await fetch(url, { headers: { authorization: `${scheme} ${token}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Could not read your profile (${res.status}).`);
  return res.json();
}

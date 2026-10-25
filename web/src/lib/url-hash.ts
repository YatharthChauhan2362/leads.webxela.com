// Search hides people the team already has without sending their links to the browser:
// the server sends a short hash of each link and the page hashes each result the same way.

/** One spelling for a link, so the same profile always matches. */
export function normUrl(u: string) {
  return u.toLowerCase().replace(/^https?:\/\/[a-z]{2,3}\.linkedin/, "https://www.linkedin").replace(/[?#].*$/, "").replace(/\/$/, "");
}

/** cyrb53: a fast 53 bit string hash. */
export function urlHash(u: string) {
  const s = normUrl(u);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

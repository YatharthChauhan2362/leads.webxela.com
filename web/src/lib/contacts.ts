const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g;
// Phone numbers with a country code or at least 10 digits, allowing spaces, dots, dashes and brackets.
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{3,5}(?:[\s.-]?\d{2,4})?/g;

const JUNK_EMAIL = /(example\.com|sentry|wixpress|\.png$|\.jpg$|\.gif$|noreply|no-reply)/i;

export function extractEmails(text: string): string[] {
  const found = text.match(EMAIL_RE) ?? [];
  return uniq(
    found
      .map((e) => e.replace(/[.,;:]+$/, "").toLowerCase())
      .filter((e) => !JUNK_EMAIL.test(e)),
  );
}

export function extractPhones(text: string): string[] {
  const found = text.match(PHONE_RE) ?? [];
  return uniq(
    found
      .map((p) => p.trim())
      .filter((p) => {
        const digits = p.replace(/\D/g, "");
        if (digits.length < 10 || digits.length > 15) return false;
        // Placeholders like 0000000000 or 8888888888, and runs like 1234567890.
        if (new Set(digits).size <= 3 || "01234567890123456789".includes(digits.slice(-10))) return false;
        // Skip years, dates and long ID numbers that look like phones.
        if (/^(19|20)\d{2}[\s.-]?\d{2}[\s.-]?\d{2}$/.test(p)) return false;
        if (/^\d+$/.test(p) && !p.startsWith("+") && digits.length > 12) return false;
        return true;
      }),
  );
}

export function uniq(list: string[]): string[] {
  return [...new Set(list.filter(Boolean))];
}

export function mergeList(a: string, b: string[]): string {
  return uniq([...a.split(",").map((s) => s.trim()), ...b]).join(", ");
}

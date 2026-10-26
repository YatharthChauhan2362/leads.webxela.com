// Fonts an admin can pick for the whole app, under Settings, Branding.
// Each sets the body font and the heading font. The files are bundled, so nothing loads from another site.

const SYSTEM = `system-ui, -apple-system, "Segoe UI", sans-serif`;

export const FONTS = {
  inter: { label: "Inter Tight", note: "The original", sans: `var(--font-inter-tight), ${SYSTEM}`, display: `var(--font-bricolage), var(--font-inter-tight), ${SYSTEM}` },
  montreal: { label: "Neue Montreal", note: "Same as webxela.com", sans: `var(--font-neue-montreal), ${SYSTEM}`, display: `var(--font-neue-montreal), ${SYSTEM}` },
  bricolage: { label: "Bricolage Grotesque", note: "Rounder and bolder", sans: `var(--font-bricolage), ${SYSTEM}`, display: `var(--font-bricolage), ${SYSTEM}` },
  system: { label: "Device font", note: "San Francisco on Apple, Segoe on Windows, Roboto on Android", sans: SYSTEM, display: SYSTEM },
} as const;

export type FontKey = keyof typeof FONTS;
export const FONT_KEYS = Object.keys(FONTS) as [FontKey, ...FontKey[]];
export const fontOf = (key: string | undefined): FontKey => (key && key in FONTS ? (key as FontKey) : "inter");

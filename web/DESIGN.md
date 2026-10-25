# Yatri Cloud design system (Yatri Playbook)

The same look as Yatri School, with one change for Playbook: no icons anywhere. Every value here is copied from the working code:
- tokens: `src/app/globals.css`
- components: `src/components/ui/*`
- app shell: `src/components/shell/*`

If the code and this file ever disagree, the code wins. Update this file to match.

Stack: Next.js App Router + Tailwind CSS v4 (`@theme` tokens). No icon library. The rules also apply without Tailwind; the plain CSS values are given.

---

## 1. The feel in one paragraph

White pages, one solid bright blue, near-black text, thin grey borders, 12 to 24px rounded corners. Each screen has one blue header panel and one main blue button. Everything else is white, grey and ink. It should look minimal, calm and premium, not "AI generated". Screens are for non-technical people, so the type is large (15 to 16px body), touch targets are at least 44px, and words are plain.

## 2. Never do this

These come from the owner's direct feedback.

- No light or pale blue fills anywhere: no `blue-50`, no `primary/10`, no tinted hovers, no blue glows behind text.
- No gradients between different colours (navy to blue, blue to purple). The only gradient allowed is the subtle same-blue vertical panel in section 4.
- No coloured top or side bars on cards, no vertical accent stripes and no blue line under the header.
- No dark or heavy shadows. In PDFs, no shadows at all, because viewers draw them as dark bands.
- No icons at all in Playbook: navigation, buttons, callouts and status use words. No emojis.
- No fake logos, fake stats or fake testimonials. Use real brand files.
- No dark text on blue. No small "eyebrow" label above every title.
- Never show status by colour alone; every status pill has a word.

## 3. Tokens

Copy this into the new app's global CSS. It is Tailwind v4; the variables also work as plain CSS custom properties.

```css
@import "tailwindcss";

@theme {
  --color-background: hsl(0 0% 100%);        /* white */
  --color-foreground: hsl(0 0% 9%);          /* ink #171717 */
  --color-surface: hsl(0 0% 98%);
  --color-canvas: hsl(0 0% 98%);             /* app background behind cards */
  --color-muted: hsl(0 0% 96%);              /* grey hover / quiet fills */
  --color-muted-foreground: hsl(0 0% 38%);   /* secondary text */
  --color-border: hsl(0 0% 90%);             /* hairlines */
  --color-input: hsl(0 0% 84%);              /* input borders */
  --color-ring: hsl(210 100% 50%);

  --color-primary: hsl(210 100% 50%);        /* THE blue, #0080FF */
  --color-primary-hover: hsl(210 100% 44%);
  --color-primary-foreground: hsl(0 0% 100%);
  --color-brand: hsl(210 100% 50%);          /* same as primary on purpose */

  --color-success: hsl(152 65% 28%);
  --color-warning: hsl(30 90% 32%);
  --color-danger: hsl(0 70% 44%);

  --font-sans: var(--font-inter-tight), system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-display: var(--font-bricolage), var(--font-inter-tight), system-ui, sans-serif;

  --radius-sm: 0.5rem;
  --radius-md: 0.625rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;

  --shadow-inset: inset 0 0.5px 0 hsl(0 0% 100% / 0.25), inset 0 0 0 0.5px hsl(0 0% 0% / 0.2), 0 1px 2px hsl(0 0% 0% / 0.08);
  --shadow-card: 0 4px 16px hsl(0 0% 0% / 0.06);       /* hover only */
  --shadow-glow: 0 0 40px hsl(210 100% 50% / 0.12);    /* blue header panel only */
}

@layer base {
  body {
    background: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
    font-size: 16px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
  }
  h1, h2, h3 { font-family: var(--font-display); letter-spacing: -0.015em; line-height: 1.15; }
  :focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
  button, a, input, select, textarea, label { touch-action: manipulation; }
  table { font-variant-numeric: tabular-nums; }
  /* Wide tables scroll inside their box instead of pushing the page sideways on phones */
  .grid { grid-template-columns: minmax(0, 1fr); }
  .grid > * { min-width: 0; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

### Colour use

| Use | Colour |
| --- | --- |
| Page header panel, main button, active menu item, table header row, active tab, links, stat numbers | Blue `#0080FF` |
| Button hover | Blue 44% `hsl(210 100% 44%)` |
| Body text, headings | Ink `#171717` |
| Secondary text | Grey `hsl(0 0% 38%)` |
| Borders | `hsl(0 0% 90%)`, 1px |
| App background behind cards | `hsl(0 0% 98%)` |
| Paid, present, done | Green `hsl(152 65% 28%)`, white text |
| Part paid, late | Amber `hsl(30 90% 32%)`, white text |
| Due, absent, errors | Red `hsl(0 70% 44%)`, white text |

White text on this blue is about 3.7:1, so text on blue is always 15px or larger and medium weight or bolder.

## 4. Type

- **Body:** Inter Tight (variable, 100 to 900), self-hosted.
- **Headings and big numbers:** Bricolage Grotesque (variable, 200 to 800), self-hosted.
- **Font files:** copy `src/app/fonts/inter-tight-latin-wght-normal.woff2` and `bricolage-grotesque-latin-wght-normal.woff2`.

```ts
// app/layout.tsx
import localFont from "next/font/local";
const interTight = localFont({ src: "./fonts/inter-tight-latin-wght-normal.woff2", variable: "--font-inter-tight", weight: "100 900", display: "swap" });
const bricolage = localFont({ src: "./fonts/bricolage-grotesque-latin-wght-normal.woff2", variable: "--font-bricolage", weight: "200 800", display: "swap" });
// <html className={`${interTight.variable} ${bricolage.variable}`}>
```

| Element | Size | Weight | Font |
| --- | --- | --- | --- |
| Page title (in blue panel) | 28px, 36px from `sm` | 700, tracking -0.02em | Display |
| Website hero title | 36px, 50px from `sm`, line-height 1.08 | 700 | Display |
| Card title | 17px | 600 | Sans, letter-spacing 0 |
| Body | 15 to 16px, line-height 1.55 | 400 | Sans |
| Labels, notes | 13 to 14px | 500 | Sans |
| Stat number | `clamp(22px, 6.2vw, 30px)` | 800 | Display, tabular |
| Table header | 12.5px, uppercase, tracking 0.04em | 600 | Sans |
| Smallest text allowed | 13px | | |

## 5. Layout and spacing

- **App shell:** a 272px white sidebar on desktop with a right hairline, and the content on the `canvas` grey.
  - Content: `max-w-6xl`, padding `px-4 sm:px-6 lg:px-10`, `py-6 lg:py-10`.
  - Phones: a 64px (`h-16`) white top bar with a bottom hairline and a "Menu" button.
- **Website:** white, a 64px header with a grey hairline, and a centred container. Leave generous space below the footer (`pb-14`).
- **Radius:** inputs and buttons 12px (`rounded-xl`), cards 16px (`rounded-2xl`), page header panel 24px (`rounded-3xl`), pills fully round.
- **Touch targets:** at least 44px high. Buttons are 44px (`h-11`) by default, inputs 48px (`h-12`).
- **Screen sizes:** every screen must work at 390px (phone) and 820px (iPad) with no sideways scroll. Wide tables scroll inside their own box.

## 6. Components

These are Tailwind class recipes taken from the real components; copy them as they are.

### Buttons

```ts
const base = "inline-flex items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap transition-[color,background-color,border-color,transform] duration-150 touch-manipulation active:scale-[0.97] disabled:opacity-60 disabled:pointer-events-none select-none";
const variants = {
  primary:   "bg-primary text-primary-foreground shadow-[var(--shadow-inset)] hover:bg-primary-hover",
  secondary: "border border-border bg-background text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary",
  ghost:     "text-foreground hover:bg-muted",
  danger:    "border border-danger/30 bg-background text-danger hover:bg-danger hover:text-white hover:border-danger",
};
const sizes = { sm: "h-9 px-3 text-sm", md: "h-11 px-4 text-[15px]", lg: "h-12 px-6 text-base" };
```

- Use one primary button per screen.
- The label says what happens ("Save attendance", "Pay ₹2,500"), never "Submit" or "OK".
- While saving, the button shows a pending label and is disabled.

### Page header (blue panel)

Every app page starts with it.

```tsx
const BLUE_PANEL = "linear-gradient(180deg, hsl(207 100% 55%) 0%, hsl(210 100% 50%) 55%, hsl(213 100% 46%) 100%)";

<header className="mb-7">
  <div className="relative overflow-hidden rounded-3xl px-6 py-7 text-white sm:px-9 sm:py-9" style={{ backgroundImage: BLUE_PANEL }}>
    {/* faint ring, top right */}
    <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full border-[28px] border-white/10" />
    <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-[28px] font-bold tracking-[-0.02em] sm:text-[36px]">Title</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-white/85 sm:text-[16px]">One plain sentence.</p>
      </div>
      {/* actions: first = white with blue text, others = white outline */}
    </div>
  </div>
</header>
```

- **Actions inside the panel:** the first is solid white with blue text. The rest are transparent with a `white/40` border, and hover to `white/16`.
- **Status pills inside the panel:** white with blue text.
- **When printed:** the panel turns into plain ink text with no background.

### Card

```
rounded-2xl border border-border bg-background p-5 sm:p-6 shadow-[0_1px_2px_hsl(0_0%_0%/0.04)]
```

- **Clickable card:** add `hover:-translate-y-0.5 hover:border-primary hover:shadow-[var(--shadow-card)] active:scale-[0.99] transition-all duration-200`.
- **Card header:** a 17px semibold title, a 14px grey description, and an optional "View all →" link in blue on the right.

### Stat

- A plain white card with a 14px grey label, a large blue number in the display font, and a 13px grey note.
- No icon.
- A linked stat shows a small blue arrow on hover.

### Table

```
wrapper: relative overflow-x-auto rounded-2xl border border-border bg-background
table:   w-full min-w-[560px] border-collapse text-left text-[15px]
thead:   bg-primary text-[12.5px] text-white
th:      whitespace-nowrap border-r border-white/15 px-4 py-3.5 font-semibold uppercase tracking-[0.04em] last:border-r-0
td:      border-r border-b border-border px-4 py-3.5 align-middle last:border-r-0
tr:      bg-background hover:bg-canvas last:[&>td]:border-b-0
```

Align amounts to the right. Money uses Indian grouping (₹18,61,650).

### Form fields

```
input/select: block w-full h-12 rounded-xl border border-input bg-background px-3 text-[15px] placeholder:text-muted-foreground/70
              focus:border-primary focus:outline-none focus:ring-3 focus:ring-ring/25 disabled:bg-muted
label:        mb-1.5 block text-sm font-medium        (+ "(optional)" in grey when optional)
hint:         mt-1.5 text-[13px] text-muted-foreground
checkbox:     size-5 rounded border-input accent-primary, with a 15px label and a 13px hint
```

- **Form sections:** separated by a top hairline (`border-t pt-6`), each with a 16px semibold title.
- **Validation:** use native HTML validation (`required`, `type`, `min`), plus a server check that sends back a plain message.

### Tabs

A segmented control.

```
nav:      inline-flex gap-1 rounded-2xl border border-border bg-background p-1.5   (overflow-x-auto on phones)
tab:      whitespace-nowrap rounded-xl px-4 py-2.5 text-[15px] font-medium
active:   bg-primary text-primary-foreground shadow-[var(--shadow-inset)]
inactive: text-muted-foreground hover:bg-muted hover:text-foreground
```

### Badge (status pill)

```
inline-flex items-center whitespace-nowrap rounded-full px-3 py-0.5 text-[13px] font-semibold
neutral: bg-muted text-foreground ring-1 ring-border
blue:    bg-primary text-white
green:   bg-success text-white
amber:   bg-warning text-white
red:     bg-danger text-white
```

### Messages

- **Saved or error (flash):** a white card (`rounded-2xl border p-3 px-4`) with a small solid dot: blue when saved, red for an error. Use `role="status"` or `role="alert"`, with one plain sentence.
- **Callout inside a page:** a white card (`rounded-xl border px-4 py-3`) with a short coloured label word (Note, Check, Important, Done). The fill is never tinted.
- **Empty state:** a dashed blue border box (`border-2 border-dashed border-primary rounded-2xl py-12 text-center`) with a title, one line of help and the next-step button.
- **Small empty state in a card:** a one-line title, a grey line and an optional button.

### Sidebar navigation

- **Group label:** 11px uppercase, tracking 0.08em, grey.
- **Item:** `flex min-h-[44px] items-center gap-3 rounded-xl px-3.5 text-[15px] font-medium`, text only. A count pill on the right where it helps (Notifications).
- **Active and hover:** `bg-brand text-white`. Inactive: grey text.
- **Top of the sidebar:** a blue card with the organisation's name (the same `BLUE_PANEL` and faint ring).
- **Bottom:** the user (initials in an ink circle) and Sign out. Sign out turns red on hover.

### Logo lockup

`logo.png` (32px) + "Yatri **Playbook**" in the display font: 18px, bold, tight tracking, with the second word in blue. For a new app, keep the pattern: "Yatri" in ink and the product word in blue.

### Brand marks

Use real logo files for UPI, Google Pay, PhonePe, Paytm, RuPay, Visa, Mastercard and WhatsApp (see `public/logos/` and `CREDITS.md`), each in its own colours. Only show a logo where the app really works with that service.

## 7. Website pages

- **Hero:** a large blue area (the same blue, with an optional soft lighter glow in the top right), a white title, one line of intro, and at most two buttons (white solid, white outline).
- **Sections:** white, with a 30 to 40px section title in the display font and one grey intro line.
- **Feature cards:** white with a hairline border; on hover the border turns blue and the card lifts slightly.
- **Floating notes over a product picture:** white with a thin border and a very light shadow. They may drift slowly (`float` 6s), turned off for reduced motion.
- **Page structure:** keep it short. Hero, real payment logos, six features, a demo section, FAQ, and a closing call to action.

## 8. Motion

- **Transitions:** 150 to 200ms colour and transform only.
- **Buttons:** shrink to 0.97 when pressed.
- **Cards:** lift 2px on hover.
- **Reduced motion:** respect `prefers-reduced-motion`. No bouncing, no long animations.

## 9. Writing on screen

- Short, plain sentences for school staff and parents. Use school words (class, fee, receipt), not software words (tenant, entity, sync).
- No hype words, no "not X but Y", no forced lists of three, no dashes as punctuation.
- Errors say what happened and what to do next, in one or two sentences.
- Dates are in Indian format (18 Oct 2026). Money is in rupees with Indian grouping.

## 10. Accessibility checklist

- **States:** every control has default, hover, pressed, focus, disabled, loading, error and empty states.
- **Focus ring:** a visible 2px blue outline with a 2px offset.
- **Labels:** every input has a visible label. Icons are `aria-hidden` with text next to them.
- **Contrast:** WCAG AA for body text, and at least 15px medium on blue.
- **Status:** never shown by colour alone.

## 11. Printed pages and PDFs

- **Print:** hide the navigation and buttons (`.no-print`). The blue header becomes ink text. Margins are 14mm.
- **PDFs:** follow `docs/presentations/` (`src/theme.css`):
  - white pages, one blue, Bricolage Grotesque headings and Inter Tight body
  - screenshots in white frames with hairline borders, and no shadows
  - one idea per page with a short headline and at most three or four short points
  - more pages, never smaller text

## 12. Starting a new app with this look

1. Copy the two font files and the token block from section 3.
2. Copy `src/components/ui/` (button, layout, table, form, flash, status-dot, submit-button) and `src/components/brand.tsx`, then change the product name.
3. Copy `public/logo.png` and, if payments are involved, `public/logos/`.
4. Build the app shell from section 6 (sidebar, phone top bar, blue page header).
5. Check every screen at 390px and 820px, and compare it with the "Never do this" list in section 2.

## 13. Playbook pieces

- **Step card:** `rounded-2xl border bg-canvas p-4 sm:p-5`; a 40px white number circle in the display font, the instruction at 16px medium, the screenshot in a white frame with a hairline border.
- **Click circle:** a 44px ring (30px on phones) in the workspace colour with a 3px white halo. Same in PDFs (26pt).
- **Tip and alert:** white card with the word Tip (green) or Alert (red) above the text.
- **Exports:** A4, the title on the left and the workspace logo on the right, "Made with Yatri Playbook" and the page number in the footer. No shadows.

## 14. Website motion (playbook.yatricloud.com)

- Library: Motion (`motion/react`), in small client components under `src/components/marketing/`. Pages stay server components.
- The hero shows the product working: a cursor clicks through a form and the guide writes itself beside it. It runs only while on screen.
- Sections rise into view once (`Reveal`), headlines rise word by word (`WordsRise`), numbered steps have a line that fills on scroll (`ScrollLine`).
- Feature tiles each carry one small live demo (blur, cursor styles, typing, exports, copy link, platforms marquee).
- Every animation turns off for people who prefer reduced motion; the finished state shows instead.
- Still white, one blue, ink and hairlines. Numbers in the display font mark active items; no side stripes.
- Real brand logos (`public/logos/`, sources in `CREDITS.md`) appear only for products Playbook works with: where you capture (Chrome, Edge, macOS, Windows, iPhone, iPad, Android, Excel, Outlook, SAP) and where guides go (Notion, Confluence, Slack, Teams, WhatsApp). Use `BrandLogo` and `LogoPill` from `src/components/marketing/brand-logos.tsx`, in the logo's own colours on white. They are brand marks, not icons; the no-icons rule still holds.
- Phones and tablets: `DeviceDemo` draws iPhone, iPad and Android frames in CSS where taps write the guide; `BrandDemo` flips a shared guide between free and Your brand.

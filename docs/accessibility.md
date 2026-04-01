# Accessibility Guide — CapitalForge

## Overview

CapitalForge targets **WCAG 2.1 Level AA** conformance across all 42 application pages. This document covers compliance targets, testing procedures, known issues, and the remediation plan.

---

## Compliance Target

| Standard | Level | Status |
|---|---|---|
| WCAG 2.1 A  | All Success Criteria | In progress |
| WCAG 2.1 AA | All Success Criteria | In progress |
| Section 508 | Aligned with WCAG 2.1 AA | Planned |

**Goal:** Full WCAG 2.1 AA conformance by Q3 2026.

---

## Framework Architecture

### i18n (`src/frontend/lib/i18n/`)

| File | Purpose |
|---|---|
| `index.ts` | Locale detection, `t()` function, `I18nProvider`, `useI18n` hook, RTL flag, formatters |
| `en-US.ts` | English (US) — 500+ translation keys across all 42 pages |
| `es-MX.ts` | Spanish (Mexico) — full translation of all keys |
| `fr-CA.ts` | French (Canada) — partial translations, requires professional review |

**Usage:**

```tsx
// Wrap your app (in layout.tsx or a client boundary)
import { I18nProvider } from '@/lib/i18n';

<I18nProvider>
  <App />
</I18nProvider>

// In components
import { useI18n } from '@/lib/i18n';

function MyComponent() {
  const { t, formatCurrency, locale, setLocale } = useI18n();
  return <h1>{t('dashboard.title')}</h1>;
}
```

**Key naming convention:** `namespace.camelCaseKey`
**Variable interpolation:** `t('error.required', { field: 'Email' })` → `"Email is required"`

**Supported locales:**
- `en-US` — English (United States) — default
- `es-MX` — Spanish (Mexico)
- `fr-CA` — French (Canada) — placeholder, production-ready translations needed

**Locale detection order:**
1. `localStorage['cf-locale']` — persisted user preference
2. `navigator.languages` — browser language preference
3. `en-US` — fallback default

**RTL support:** Infrastructure is in place. Add locales to `RTL_LOCALES` array in `index.ts` when Arabic/Hebrew/Farsi support is added. The `I18nProvider` automatically sets `document.documentElement.dir`.

---

### A11y Components (`src/frontend/components/ui/`)

#### `skip-nav.tsx`

Skip navigation link that is visually hidden until focused, allowing keyboard users to bypass sidebar navigation.

**Integration** — add as the first element inside `<body>` in `layout.tsx`:

```tsx
import { SkipNav } from '@/components/ui/skip-nav';
import { useI18n } from '@/lib/i18n';

// In layout.tsx, add before <div className="cf-layout">:
<SkipNav label={t('a11y.skipToMain')} targetId="main-content" />
```

The existing `<main id="main-content">` in `layout.tsx` is already correctly set up as the skip target.

#### `focus-trap.tsx`

Focus trap for modals, drawers, and dialogs. Traps Tab/Shift+Tab within the container and releases focus on Escape.

```tsx
import { FocusTrap } from '@/components/ui/focus-trap';

<FocusTrap active={isOpen} onEscape={() => setIsOpen(false)}>
  <div role="dialog" aria-modal="true" aria-label="Edit Application">
    {/* modal content */}
  </div>
</FocusTrap>
```

**Hook alternative** for existing elements:
```tsx
import { useFocusTrap } from '@/components/ui/focus-trap';
const ref = useFocusTrap({ active: isOpen, onEscape: close });
<div ref={ref as any}>…</div>
```

#### `accessible-form.tsx`

Complete accessible form system. All primitives handle label association, ARIA states, and error announcement automatically.

```tsx
import {
  Form, FormField, FormLabel, FormInput,
  FormTextarea, FormSelect, FormSection,
  FormRow, FormCheckbox, FormRadioGroup,
  LiveAnnouncer, VisuallyHidden,
} from '@/components/ui/accessible-form';

// Example: Required field with error and hint
<FormField required error={errors.email} hint="We will never share your email.">
  <FormLabel>Email Address</FormLabel>
  <FormInput type="email" autoComplete="email" placeholder="you@company.com" />
</FormField>

// Screen reader announcement
<LiveAnnouncer message={statusMessage} politeness="polite" />
```

---

### A11y Audit (`src/frontend/lib/a11y/audit-checklist.ts`)

Programmatic WCAG 2.1 AA checklist covering 22 checks across 9 categories:

| Category | Checks | Key Criteria |
|---|---|---|
| Keyboard Navigation | 4 | 2.1.1, 2.1.2, 2.4.1, 2.4.7 |
| Color Contrast | 3 | 1.4.3, 1.4.11, 1.4.1 |
| Screen Reader | 4 | 1.3.1, 4.1.3, 1.3.5, 2.4.6 |
| Focus Management | 3 | 2.4.3 (all scenarios) |
| Form Labels | 4 | 1.3.1, 3.3.1, 3.3.2, 3.3.4 |
| Alt Text | 2 | 1.1.1 |
| ARIA Roles | 3 | 4.1.2, 1.3.6 |
| Page Structure | 3 | 2.4.2, 3.1.1, 2.4.4 |
| Motion / Animation | 1 | 2.3.3 |

**Programmatic audit workflow:**

```ts
import { createPageAudit, summarizeAudit, getRemediationItems } from '@/lib/a11y/audit-checklist';

// Create a fresh audit for a page
const audit = createPageAudit('applications', 'Applications', 'tester@capitalforge.com');

// Update item status after manual testing
audit.items[0].status   = 'pass';
audit.items[0].testedBy = 'Alice';
audit.items[0].testedAt = new Date().toISOString();

// Get summary
const summary = summarizeAudit(audit);
console.log(`Pass rate: ${summary.passRate}% — Compliant: ${summary.compliant}`);

// Get remediation backlog
const backlog = getRemediationItems(audit);
```

---

## Testing Procedures

### Automated Testing

Run on every CI build:

1. **axe-core** via `@axe-core/react` in development mode — catches ~40% of WCAG issues automatically
2. **Lighthouse accessibility audit** — score target ≥ 95
3. **Jest + Testing Library** — form component aria attribute assertions

Planned CI integration:
```bash
# Add to CI pipeline (do not run npm install — already in dependencies)
npx axe-cli http://localhost:3000 --tags wcag2a,wcag2aa
```

### Manual Testing Checklist

Run before each release:

#### Keyboard Only (15–20 min per page)
- [ ] Tab through entire page without mouse
- [ ] Every interactive element is reachable and operable
- [ ] Skip nav link appears on first Tab
- [ ] No keyboard traps (except intentional modal traps)
- [ ] Focus indicator always visible
- [ ] Modals open/close with keyboard, focus is managed

#### Screen Reader Testing
- [ ] **Windows:** NVDA + Firefox (free) or JAWS + Chrome
- [ ] **macOS/iOS:** VoiceOver + Safari (`Cmd+F5` to toggle)
- [ ] **Android:** TalkBack + Chrome
- [ ] Headings announce correctly and follow hierarchy
- [ ] Form labels and error messages are announced
- [ ] Dynamic content updates (toasts, loading states) are announced
- [ ] Tables announce column headers

#### Color Contrast
- [ ] Run Lighthouse on each page (Accessibility tab)
- [ ] Manually check gray placeholder text with Colour Contrast Analyser
- [ ] Verify status badges in all states (pending/approved/rejected)
- [ ] Check focus ring contrast against all backgrounds

#### Zoom & Magnification
- [ ] 200% zoom — no content overflow or loss of functionality
- [ ] 400% zoom — content reflows to single column (responsive)
- [ ] Browser text-only zoom — layouts remain usable

#### Mobile Accessibility
- [ ] iOS VoiceOver — swipe navigation through sidebar
- [ ] Android TalkBack — form interactions
- [ ] Touch target size ≥ 44×44px for all interactive elements

---

## Known Issues

> Status as of 2026-03-31. Issues are tracked in the project's issue tracker.

### Blockers (WCAG Level A failures)

| ID | Page(s) | Issue | Criterion | Severity |
|---|---|---|---|---|
| A11Y-001 | All pages | Skip nav link not yet integrated into `layout.tsx` | 2.4.1 | Blocker |
| A11Y-002 | All modals/dialogs | FocusTrap not yet applied to existing modal patterns | 2.1.2 | Blocker |
| A11Y-003 | Applications, Clients | Table "View/Edit" buttons lack row context in aria-label | 4.1.2 | Blocker |

### Major (WCAG Level AA failures)

| ID | Page(s) | Issue | Criterion | Severity |
|---|---|---|---|---|
| A11Y-004 | All pages | Gray helper text (`text-gray-400` = ~2.5:1) fails contrast | 1.4.3 | Major |
| A11Y-005 | All pages | Status-only dots (red/green) have no secondary text indicator | 1.4.1 | Major |
| A11Y-006 | All forms | Existing form inputs use placeholder-only labels in several pages | 3.3.2 | Major |
| A11Y-007 | All pages | `lang` attribute hardcoded as "en"; not updated on locale switch | 3.1.1 | Major |
| A11Y-008 | All pages | Toast notifications outside any `aria-live` region | 4.1.3 | Major |

### Minor

| ID | Page(s) | Issue | Criterion | Severity |
|---|---|---|---|---|
| A11Y-009 | Sidebar | Collapsed sidebar icon-only nav links have title but no aria-label | 2.4.6 | Minor |
| A11Y-010 | Data Table | Sort column buttons missing `aria-sort` attribute | 4.1.2 | Minor |
| A11Y-011 | All pages | CSS transitions not suppressed for `prefers-reduced-motion` | 2.3.3 | Minor |
| A11Y-012 | Dashboard | Chart/graph components have no text alternative | 1.1.1 | Minor |

---

## Remediation Plan

### Phase 1 — Blockers (Target: Q2 2026)

**Priority 1: Layout-level fixes** (1–2 days)
- Integrate `<SkipNav>` into `layout.tsx` as first element in `<body>`
- Update `layout.tsx` to call `document.documentElement.lang` on locale change (or pass from server via `I18nProvider initialLocale`)
- Add `aria-live` region to toast notification system

**Priority 2: Modal/dialog audit** (3–5 days)
- Inventory all modal patterns across 42 pages
- Wrap each with `<FocusTrap>` component
- Verify focus moves into modal on open and returns on close

**Priority 3: Table row action labels** (2–3 days)
- Update all table "View", "Edit", "Delete" buttons to include row context:
  ```tsx
  <button aria-label={`View application ${app.id}`}>View</button>
  ```

### Phase 2 — Majors (Target: Q2–Q3 2026)

**Color contrast remediation** (3–5 days)
- Replace `text-gray-400` with `text-gray-500` (4.6:1) for body/helper text
- Audit all badge/status components; update palette to meet 4.5:1
- Add `globals.css` rule: `*::placeholder { color: #6B7280; }` (gray-500 = 4.6:1)

**Status indicator improvements** (2 days)
- All status dots/badges must include visible text label alongside color
- Example: `<span class="status-dot bg-green-500" aria-hidden="true" /> <span>Active</span>`

**Form migration** (1–2 weeks)
- Migrate existing page forms to `<AccessibleForm>` primitives incrementally
- Start with highest-traffic pages: applications, clients, settings
- Use `<FormField>`, `<FormLabel>`, `<FormInput>` replacing raw `<input>` elements

### Phase 3 — Minor + Enhancements (Target: Q3 2026)

- Add `aria-sort` to `DataTable` column headers
- Add `prefers-reduced-motion` CSS block to `globals.css`
- Add chart text alternatives (data tables or `aria-describedby` summaries)
- Complete fr-CA translations with professional review
- Implement `role="status"` on page-level loading states

### Phase 4 — Full Suite Audit (Target: Q4 2026)

- Complete programmatic audit of all 42 pages using `audit-checklist.ts`
- Engage third-party accessibility auditor (recommended: Deque Systems)
- Address all remaining Level A/AA findings
- Publish VPAT (Voluntary Product Accessibility Template)

---

## Resources & Tools

| Tool | Purpose | URL |
|---|---|---|
| axe DevTools | Browser extension — automated scan | https://www.deque.com/axe/devtools/ |
| WAVE | Visual accessibility feedback | https://wave.webaim.org/ |
| Lighthouse | Built into Chrome DevTools | Built-in |
| NVDA | Free Windows screen reader | https://www.nvaccess.org/ |
| Colour Contrast Analyser | Desktop contrast checker | https://www.tpgi.com/color-contrast-checker/ |
| WebAIM Contrast Checker | Online contrast checker | https://webaim.org/resources/contrastchecker/ |
| WCAG 2.1 Quick Reference | Official guidelines | https://www.w3.org/WAI/WCAG21/quickref/ |
| MDN ARIA Patterns | ARIA authoring practices | https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA |
| ARIA APG | WAI-ARIA Authoring Practices Guide | https://www.w3.org/WAI/ARIA/apg/ |

---

## Contact

For accessibility issues or questions, contact the platform team or file a bug tagged `accessibility` / `a11y` in the issue tracker.

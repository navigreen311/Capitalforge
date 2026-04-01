/**
 * WCAG 2.1 AA Audit Checklist — CapitalForge
 *
 * Exportable audit items with pass/fail/na status per page/component,
 * covering keyboard navigation, color contrast, screen reader, focus
 * management, form labels, alt text, and ARIA roles.
 *
 * Usage:
 *   import { A11Y_CHECKLIST, createPageAudit, AuditStatus } from '@/lib/a11y/audit-checklist';
 *
 *   const audit = createPageAudit('applications');
 *   audit.items[0].status = 'pass';
 *   const report = summarizeAudit(audit);
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditStatus = 'pass' | 'fail' | 'partial' | 'na' | 'untested';

export type WcagLevel = 'A' | 'AA' | 'AAA';

export type AuditCategory =
  | 'keyboard-navigation'
  | 'color-contrast'
  | 'screen-reader'
  | 'focus-management'
  | 'form-labels'
  | 'alt-text'
  | 'aria-roles'
  | 'page-structure'
  | 'motion-animation'
  | 'timing';

export interface AuditCheckItem {
  /** Unique identifier for this check */
  id: string;
  /** WCAG 2.1 Success Criterion number, e.g. "1.1.1" */
  criterion: string;
  /** Human-readable criterion name */
  criterionName: string;
  /** Conformance level required */
  level: WcagLevel;
  /** Audit category for grouping */
  category: AuditCategory;
  /** What to test */
  description: string;
  /** How to perform the test */
  testProcedure: string;
  /** Expected result when passing */
  expectedResult: string;
  /** Common failure patterns */
  commonFailures: string[];
  /** Tool recommendations */
  tools: string[];
}

export interface PageAuditItem extends AuditCheckItem {
  status:   AuditStatus;
  notes:    string;
  severity: 'blocker' | 'major' | 'minor' | 'enhancement' | null;
  testedBy: string;
  testedAt: string | null;
  /** Link to a filed issue or ticket */
  issueUrl: string | null;
}

export interface PageAudit {
  page:          string;
  pageTitle:     string;
  auditedAt:     string | null;
  auditedBy:     string;
  wcagTarget:    '2.1 AA';
  items:         PageAuditItem[];
}

export interface AuditSummary {
  page:          string;
  total:         number;
  pass:          number;
  fail:          number;
  partial:       number;
  na:            number;
  untested:      number;
  passRate:      number; // 0–100 (excluding na/untested)
  blockers:      number;
  majors:        number;
  compliant:     boolean;
}

// ─── Master Checklist ─────────────────────────────────────────────────────────

export const A11Y_CHECKLIST: AuditCheckItem[] = [

  // ── 1. Keyboard Navigation ─────────────────────────────────────────────────

  {
    id:            'kn-01',
    criterion:     '2.1.1',
    criterionName: 'Keyboard',
    level:         'A',
    category:      'keyboard-navigation',
    description:   'All functionality is operable through a keyboard interface without requiring specific timings for individual keystrokes.',
    testProcedure: 'Navigate the entire page using only the keyboard (Tab, Shift+Tab, Enter, Space, Arrow keys). Verify every interactive element is reachable and operable.',
    expectedResult: 'Every button, link, form control, dropdown, and modal trigger is reachable and activatable via keyboard.',
    commonFailures: [
      'Custom dropdown/select components not keyboard-accessible',
      'Drag-and-drop functionality with no keyboard alternative',
      'Date pickers that require mouse interaction',
      'Tooltips that only appear on hover with no keyboard trigger',
    ],
    tools: ['Keyboard only', 'WAVE', 'axe DevTools'],
  },

  {
    id:            'kn-02',
    criterion:     '2.1.2',
    criterionName: 'No Keyboard Trap',
    level:         'A',
    category:      'keyboard-navigation',
    description:   'If keyboard focus can be moved to a component, focus can be moved away using keyboard only.',
    testProcedure: 'Use Tab/Shift+Tab to enter every interactive region (modals, dropdowns, custom widgets). Verify focus can always escape using keyboard keys.',
    expectedResult: 'Focus is never permanently trapped. Modals provide Escape to close and restore focus.',
    commonFailures: [
      'Modal dialogs that trap focus without an Escape handler',
      'Infinite focus loops in custom date pickers',
      'iFrame content that intercepts all keyboard events',
    ],
    tools: ['Keyboard only', 'FocusTrap component audit'],
  },

  {
    id:            'kn-03',
    criterion:     '2.4.1',
    criterionName: 'Bypass Blocks',
    level:         'A',
    category:      'keyboard-navigation',
    description:   'A mechanism is available to bypass blocks of content that are repeated on multiple pages.',
    testProcedure: 'On page load, press Tab once. Verify a "Skip to main content" link appears. Activate it and confirm focus jumps to the main content landmark.',
    expectedResult: 'SkipNav link is the first focusable element; activating it moves focus to <main id="main-content">.',
    commonFailures: [
      'Skip link exists in DOM but is always hidden (display:none)',
      'Skip link target id does not match the anchor href',
      'Skip link appears after other focusable elements',
    ],
    tools: ['Keyboard only', 'WAVE', 'Lighthouse'],
  },

  {
    id:            'kn-04',
    criterion:     '2.4.7',
    criterionName: 'Focus Visible',
    level:         'AA',
    category:      'keyboard-navigation',
    description:   'Any keyboard operable UI component has a visible focus indicator.',
    testProcedure: 'Tab through every interactive element. Verify a clearly visible focus ring or outline is present at all times.',
    expectedResult: 'Every focused element has a visible, high-contrast focus indicator (ring width ≥ 2px, contrast ≥ 3:1 against adjacent colors).',
    commonFailures: [
      'CSS outline:none without a visible replacement',
      'Focus indicator present but the same color as the background',
      'Third-party components that strip focus styles',
    ],
    tools: ['Keyboard only', 'axe DevTools', 'Browser dev tools'],
  },

  // ── 2. Color Contrast ──────────────────────────────────────────────────────

  {
    id:            'cc-01',
    criterion:     '1.4.3',
    criterionName: 'Contrast (Minimum)',
    level:         'AA',
    category:      'color-contrast',
    description:   'Text and images of text have a contrast ratio of at least 4.5:1. Large text (18pt / 14pt bold) requires 3:1.',
    testProcedure: 'Use a contrast checker on all text/background combinations, especially gray text on white backgrounds, white text on colored backgrounds, and placeholder text.',
    expectedResult: 'Normal text ≥ 4.5:1. Large text ≥ 3:1. Placeholder text ≥ 4.5:1.',
    commonFailures: [
      'Light gray helper text (#9CA3AF on #FFFFFF = ~2.5:1 — FAIL)',
      'White text on brand-gold background (check yellow backgrounds)',
      'Disabled control text below 3:1',
      'Status badge text insufficient contrast',
    ],
    tools: ['Colour Contrast Analyser', 'axe DevTools', 'WAVE', 'Lighthouse'],
  },

  {
    id:            'cc-02',
    criterion:     '1.4.11',
    criterionName: 'Non-text Contrast',
    level:         'AA',
    category:      'color-contrast',
    description:   'UI components and graphical objects require a contrast ratio of at least 3:1 against adjacent colors.',
    testProcedure: 'Check borders of form inputs, focus rings, chart data points, icon boundaries, and button borders.',
    expectedResult: 'All UI component boundaries and meaningful graphics have ≥ 3:1 contrast.',
    commonFailures: [
      'Input border (#D1D5DB on #FFFFFF = ~1.6:1 — FAIL for inactive state)',
      'Chart data points with insufficient contrast against chart background',
      'Icon-only buttons where the icon has low contrast',
    ],
    tools: ['Colour Contrast Analyser', 'axe DevTools'],
  },

  {
    id:            'cc-03',
    criterion:     '1.4.1',
    criterionName: 'Use of Color',
    level:         'A',
    category:      'color-contrast',
    description:   'Color is not used as the only visual means of conveying information.',
    testProcedure: 'Identify all places where color communicates meaning (status badges, trend arrows, error states, chart legends). Verify there is a secondary indicator (icon, text, pattern).',
    expectedResult: 'Status changes, errors, and data representations use color plus another visual cue (text label, icon, pattern).',
    commonFailures: [
      'Red/green status dots with no text label',
      'Required field indicated only by asterisk color change',
      'Trend up/down shown only by green/red without directional arrows',
    ],
    tools: ['Color blindness simulator (Coblis)', 'Manual review'],
  },

  // ── 3. Screen Reader ───────────────────────────────────────────────────────

  {
    id:            'sr-01',
    criterion:     '1.3.1',
    criterionName: 'Info and Relationships',
    level:         'A',
    category:      'screen-reader',
    description:   'Information, structure, and relationships conveyed through presentation can be programmatically determined.',
    testProcedure: 'Use a screen reader (NVDA/JAWS on Windows, VoiceOver on macOS) to navigate each page. Verify headings, lists, tables, and form groups are announced correctly.',
    expectedResult: 'Semantic HTML elements correctly convey structure. Tables have headers. Lists use <ul>/<ol>. Headings follow hierarchy (h1→h2→h3).',
    commonFailures: [
      'Visual tables implemented with divs/CSS Grid without ARIA table roles',
      'Heading hierarchy skips levels (h1 → h3)',
      'Form groups without <fieldset>/<legend>',
      'Status indicators announced without meaning',
    ],
    tools: ['NVDA + Firefox', 'VoiceOver + Safari', 'JAWS', 'axe DevTools'],
  },

  {
    id:            'sr-02',
    criterion:     '4.1.3',
    criterionName: 'Status Messages',
    level:         'AA',
    category:      'screen-reader',
    description:   'Status messages can be programmatically determined through role or properties so they can be announced without receiving focus.',
    testProcedure: 'Perform actions that generate status messages (save, submit, error, load complete). Verify screen reader announces them without focus moving to them.',
    expectedResult: 'Toast notifications, form error summaries, and async operation results use aria-live="polite" or role="status"/"alert" as appropriate.',
    commonFailures: [
      'Success toast not in an aria-live region',
      'Form validation errors appended to DOM but not announced',
      'Loading spinner with no programmatic completion announcement',
    ],
    tools: ['NVDA + Firefox', 'VoiceOver', 'axe DevTools'],
  },

  {
    id:            'sr-03',
    criterion:     '1.3.5',
    criterionName: 'Identify Input Purpose',
    level:         'AA',
    category:      'screen-reader',
    description:   'The purpose of each input field that collects about the user can be programmatically determined.',
    testProcedure: 'Inspect form inputs for appropriate autocomplete attributes.',
    expectedResult: 'Inputs collecting personal information have correct autocomplete values (name, email, tel, etc.).',
    commonFailures: [
      'Email input missing autocomplete="email"',
      'Name fields missing autocomplete="given-name" / "family-name"',
      'Password fields missing autocomplete="current-password" or "new-password"',
    ],
    tools: ['Browser devtools', 'axe DevTools'],
  },

  {
    id:            'sr-04',
    criterion:     '2.4.6',
    criterionName: 'Headings and Labels',
    level:         'AA',
    category:      'screen-reader',
    description:   'Headings and labels describe topic or purpose.',
    testProcedure: 'Review all headings and form labels for descriptiveness. Avoid generic labels like "Click here" or "Submit".',
    expectedResult: 'Every heading and label uniquely and descriptively identifies its content or control.',
    commonFailures: [
      'Multiple buttons labeled only "Edit" with no context',
      'Section headings like "Details" that are ambiguous out of context',
      'Icon-only buttons without aria-label',
    ],
    tools: ['Screen reader heading navigation', 'WAVE', 'axe DevTools'],
  },

  // ── 4. Focus Management ────────────────────────────────────────────────────

  {
    id:            'fm-01',
    criterion:     '2.4.3',
    criterionName: 'Focus Order',
    level:         'A',
    category:      'focus-management',
    description:   'If a web page can be navigated sequentially, focusable components receive focus in an order that preserves meaning and operability.',
    testProcedure: 'Tab through the entire page in order. Verify focus sequence matches visual/logical reading order.',
    expectedResult: 'Tab order follows the visual flow: skip nav → sidebar nav → header → main content. No unexpected focus jumps.',
    commonFailures: [
      'Positive tabindex values creating unexpected tab order',
      'Absolutely positioned elements focus in DOM order, not visual order',
      'Elements removed from visual flow still receiving focus',
    ],
    tools: ['Keyboard only', 'tabindex audit via devtools'],
  },

  {
    id:            'fm-02',
    criterion:     '2.4.3',
    criterionName: 'Focus Management — Modals',
    level:         'A',
    category:      'focus-management',
    description:   'When a dialog opens, focus moves into it. When it closes, focus returns to the trigger element.',
    testProcedure: 'Open every modal/dialog via keyboard. Verify focus moves inside. Close via Escape or close button. Verify focus returns to the trigger.',
    expectedResult: 'FocusTrap component is used. Focus enters modal on open, returns to trigger on close.',
    commonFailures: [
      'Modal opens but focus stays on the trigger outside the modal',
      'Modal closes but focus is lost (moves to <body>)',
      'Focus does not move to first actionable element inside modal',
    ],
    tools: ['Keyboard only', 'Screen reader', 'FocusTrap audit'],
  },

  {
    id:            'fm-03',
    criterion:     '2.4.3',
    criterionName: 'Focus Management — Page Navigation',
    level:         'A',
    category:      'focus-management',
    description:   'On client-side navigation, focus is managed so screen reader users understand page context has changed.',
    testProcedure: 'Navigate between pages using keyboard-activated links. Verify focus moves to an appropriate landmark or heading on the new page.',
    expectedResult: 'After route change, focus moves to the page <h1> or the main content landmark.',
    commonFailures: [
      'Next.js page transitions leaving focus on the previously active link',
      'No announcement of page title change to screen readers',
    ],
    tools: ['Screen reader', 'Keyboard only'],
  },

  // ── 5. Form Labels ─────────────────────────────────────────────────────────

  {
    id:            'fl-01',
    criterion:     '1.3.1',
    criterionName: 'Form Labels — Association',
    level:         'A',
    category:      'form-labels',
    description:   'Every form control has a programmatically associated label.',
    testProcedure: 'Inspect all form inputs. Verify each has a <label for="id"> matching the input id, or aria-label/aria-labelledby.',
    expectedResult: 'All inputs have visible, programmatically associated labels. No inputs have only placeholder text as label.',
    commonFailures: [
      'Inputs with placeholder text only — placeholder is not a label',
      'Labels adjacent to inputs but not associated via for/id',
      'Custom select components without accessible label association',
    ],
    tools: ['axe DevTools', 'WAVE', 'HTML validation'],
  },

  {
    id:            'fl-02',
    criterion:     '3.3.1',
    criterionName: 'Error Identification',
    level:         'A',
    category:      'form-labels',
    description:   'If an input error is detected, the item that is in error is identified and the error is described to the user in text.',
    testProcedure: 'Submit forms with invalid data. Verify each error is identified in text near the field and that aria-invalid="true" and aria-describedby are set.',
    expectedResult: 'Invalid fields have aria-invalid="true". Error messages are linked via aria-describedby. Errors describe the problem specifically.',
    commonFailures: [
      'Generic "Please fill in this field" without identifying the field',
      'Error indicated only by red border without text',
      'aria-invalid not set on erroneous fields',
      'Error message not programmatically associated with input',
    ],
    tools: ['axe DevTools', 'Screen reader', 'Manual testing'],
  },

  {
    id:            'fl-03',
    criterion:     '3.3.2',
    criterionName: 'Labels or Instructions',
    level:         'A',
    category:      'form-labels',
    description:   'Labels or instructions are provided when content requires user input.',
    testProcedure: 'Review forms for field format requirements. Verify format hints (e.g., "MM/DD/YYYY") appear before or in the label, not only as placeholder.',
    expectedResult: 'Required fields are identified. Format requirements are labeled. Hints appear as persistent text, not only placeholder.',
    commonFailures: [
      'Date format only shown in placeholder (disappears on input)',
      'Required fields not marked with visible indicator and aria-required',
      'No instruction for complex inputs like EIN format',
    ],
    tools: ['Manual review', 'axe DevTools'],
  },

  {
    id:            'fl-04',
    criterion:     '3.3.4',
    criterionName: 'Error Prevention — Legal/Financial',
    level:         'AA',
    category:      'form-labels',
    description:   'For pages that cause legal commitments or financial transactions, submissions are reversible, checkable, or confirmable.',
    testProcedure: 'Test all high-stakes actions (fund disbursement, contract signing, account closure). Verify confirmation step or undo mechanism.',
    expectedResult: 'Destructive or financial actions include a confirmation dialog. Submissions can be reviewed before final commitment.',
    commonFailures: [
      'Fund disbursement with no confirmation step',
      'Account closure without explicit confirmation prompt',
      'Contract e-signature with no review screen',
    ],
    tools: ['Manual review', 'User testing'],
  },

  // ── 6. Alt Text ────────────────────────────────────────────────────────────

  {
    id:            'at-01',
    criterion:     '1.1.1',
    criterionName: 'Non-text Content',
    level:         'A',
    category:      'alt-text',
    description:   'All non-text content has a text alternative that serves the equivalent purpose.',
    testProcedure: 'Identify all images, icons, charts, and non-text elements. Verify meaningful ones have descriptive alt text. Decorative ones have alt="" or aria-hidden="true".',
    expectedResult: 'Informative images have descriptive alt text. Decorative icons have aria-hidden="true". Charts have text summaries or data tables.',
    commonFailures: [
      'Icon-only buttons without aria-label (e.g., sidebar nav icons)',
      'Charts with no accessible text description',
      'Avatar images with alt="image" instead of the user\'s name',
      'Status indicator icons without screen-reader text',
    ],
    tools: ['axe DevTools', 'WAVE', 'Screen reader'],
  },

  {
    id:            'at-02',
    criterion:     '1.1.1',
    criterionName: 'Non-text Content — Logos',
    level:         'A',
    category:      'alt-text',
    description:   'Logo images convey the organization name as alt text.',
    testProcedure: 'Inspect the CapitalForge logo in the sidebar. Verify it has appropriate aria-label or alt text.',
    expectedResult: 'Logo element has aria-label="CapitalForge" or equivalent.',
    commonFailures: [
      'Logo with alt="" when it is the sole branding element',
      'Logo with alt="logo" (non-descriptive)',
    ],
    tools: ['Screen reader', 'axe DevTools'],
  },

  // ── 7. ARIA Roles ──────────────────────────────────────────────────────────

  {
    id:            'ar-01',
    criterion:     '4.1.2',
    criterionName: 'Name, Role, Value',
    level:         'A',
    category:      'aria-roles',
    description:   'For all UI components, the name and role can be programmatically determined; states, properties, and values can be set.',
    testProcedure: 'Inspect custom interactive components (custom selects, tabs, accordions, data tables, modals). Verify they have correct ARIA roles, states, and properties.',
    expectedResult: 'Custom components use correct ARIA patterns: role="dialog" for modals, role="tablist"/"tab"/"tabpanel" for tabs, aria-expanded for accordions, aria-sort for sortable columns.',
    commonFailures: [
      'Custom dropdown using div/span with no role="listbox" / role="option"',
      'Accordion triggers without aria-expanded',
      'Tabs implemented with divs lacking role="tab" / role="tabpanel"',
      'Table sort buttons without aria-sort attribute',
    ],
    tools: ['axe DevTools', 'WAVE', 'Screen reader', 'Browser accessibility inspector'],
  },

  {
    id:            'ar-02',
    criterion:     '1.3.6',
    criterionName: 'Identify Purpose',
    level:         'AAA',
    category:      'aria-roles',
    description:   'In content implemented using markup languages, the purpose of UI components, icons, and regions can be programmatically determined.',
    testProcedure: 'Verify landmark roles: banner, main, navigation, complementary, contentinfo are present and labeled where multiple of the same type exist.',
    expectedResult: 'Page has exactly one <main>, one <header role="banner">, navigation elements use <nav aria-label="…"> with unique labels, sidebar has aria-label="Main navigation".',
    commonFailures: [
      'Multiple <nav> elements without distinguishing aria-label',
      'Missing <main> landmark',
      'Footer without role="contentinfo"',
    ],
    tools: ['WAVE', 'Screen reader landmark navigation', 'axe DevTools'],
  },

  {
    id:            'ar-03',
    criterion:     '4.1.2',
    criterionName: 'Live Regions',
    level:         'A',
    category:      'aria-roles',
    description:   'Dynamic content updates that need to be announced use appropriate aria-live regions.',
    testProcedure: 'Trigger async data loads, form submissions, and status changes. Verify announcements via screen reader.',
    expectedResult: 'Loading states use aria-live="polite". Critical errors use aria-live="assertive" or role="alert". Table updates announce new data.',
    commonFailures: [
      'Toast notifications not in aria-live container',
      'Search results update without announcement',
      'Pagination updates without page announcement',
    ],
    tools: ['NVDA', 'VoiceOver', 'axe DevTools'],
  },

  // ── 8. Page Structure ──────────────────────────────────────────────────────

  {
    id:            'ps-01',
    criterion:     '2.4.2',
    criterionName: 'Page Titled',
    level:         'A',
    category:      'page-structure',
    description:   'Web pages have titles that describe topic or purpose.',
    testProcedure: 'Check <title> tag on every page. Verify it follows the "Page Name | CapitalForge" template and uniquely describes the page.',
    expectedResult: 'Every page has a unique, descriptive title. Next.js metadata template is applied consistently.',
    commonFailures: [
      'Dynamic pages showing default title instead of record name',
      'Identical titles across different pages',
      'Title not updating on client-side navigation',
    ],
    tools: ['Browser title bar', 'Screen reader', 'Lighthouse'],
  },

  {
    id:            'ps-02',
    criterion:     '3.1.1',
    criterionName: 'Language of Page',
    level:         'A',
    category:      'page-structure',
    description:   'The default human language of each web page can be programmatically determined.',
    testProcedure: 'Inspect <html lang="..."> on every page. Verify it updates when locale is switched.',
    expectedResult: '<html> element has correct lang attribute for current locale (en, es, fr).',
    commonFailures: [
      'lang attribute hardcoded as "en" even when locale is Spanish/French',
      'lang attribute missing entirely',
    ],
    tools: ['HTML validation', 'axe DevTools', 'Screen reader'],
  },

  {
    id:            'ps-03',
    criterion:     '2.4.4',
    criterionName: 'Link Purpose (In Context)',
    level:         'A',
    category:      'page-structure',
    description:   'The purpose of each link can be determined from the link text alone or from context.',
    testProcedure: 'Review all links and buttons. Verify that text alone (or text + context) describes the destination or action.',
    expectedResult: 'No links say "click here", "read more", or "learn more" without context. Table row actions include the row subject in the label.',
    commonFailures: [
      '"View" buttons in tables without context about what is being viewed',
      '"Download" links without specifying the file content',
      'Duplicate "Edit" buttons on the same page with no distinguishing context',
    ],
    tools: ['WAVE link list', 'Screen reader link navigation', 'axe DevTools'],
  },

  // ── 9. Motion / Animation ──────────────────────────────────────────────────

  {
    id:            'ma-01',
    criterion:     '2.3.3',
    criterionName: 'Animation from Interactions',
    level:         'AAA',
    category:      'motion-animation',
    description:   'Motion animation triggered by interaction can be disabled unless the animation is essential to the functionality.',
    testProcedure: 'Enable "Reduce Motion" in OS settings. Verify CSS animations and transitions are suppressed.',
    expectedResult: 'All non-essential animations (fade-in, slide, transition) are disabled when prefers-reduced-motion: reduce is active.',
    commonFailures: [
      'Transition animations not respecting prefers-reduced-motion media query',
      'Animated loading spinners that cannot be disabled',
    ],
    tools: ['OS reduced motion setting', 'CSS media query audit'],
  },
];

// ─── Page List ────────────────────────────────────────────────────────────────

export const ALL_PAGES = [
  'dashboard', 'clients', 'applications', 'funding-rounds', 'optimizer',
  'declines', 'credit-builder', 'repayment', 'spend-governance', 'rewards',
  'card-benefits', 'statements', 'billing', 'tax', 'simulator', 'sandbox',
  'hardship', 'compliance', 'documents', 'contracts', 'disclosures',
  'complaints', 'regulatory', 'comm-compliance', 'training', 'deal-committee',
  'decisions', 'fair-lending', 'ai-governance', 'crm', 'portfolio', 'partners',
  'referrals', 'issuers', 'workflows', 'settings', 'reports', 'multi-tenant',
  'offboarding', 'data-lineage', 'login',
] as const;

export type AppPage = typeof ALL_PAGES[number];

// ─── Factory Functions ────────────────────────────────────────────────────────

/**
 * Creates a fresh PageAudit for the given page slug with all items untested.
 */
export function createPageAudit(
  page: string,
  pageTitle?: string,
  auditedBy = ''
): PageAudit {
  return {
    page,
    pageTitle: pageTitle ?? page.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    auditedAt: null,
    auditedBy,
    wcagTarget: '2.1 AA',
    items: A11Y_CHECKLIST.map((check) => ({
      ...check,
      status:   'untested',
      notes:    '',
      severity: null,
      testedBy: auditedBy,
      testedAt: null,
      issueUrl: null,
    })),
  };
}

/**
 * Generates a blank audit for all 42 pages at once.
 */
export function createFullSuiteAudit(auditedBy = ''): PageAudit[] {
  return ALL_PAGES.map((page) => createPageAudit(page, undefined, auditedBy));
}

// ─── Summary & Reporting ──────────────────────────────────────────────────────

/**
 * Summarizes a PageAudit into pass/fail counts and compliance determination.
 * A page is considered WCAG 2.1 AA compliant only if all Level A and AA items
 * with required scope (not 'na') have status 'pass'.
 */
export function summarizeAudit(audit: PageAudit): AuditSummary {
  const aaItems = audit.items.filter((i) => i.level === 'A' || i.level === 'AA');
  const applicable = aaItems.filter((i) => i.status !== 'na');

  const pass    = applicable.filter((i) => i.status === 'pass').length;
  const fail    = applicable.filter((i) => i.status === 'fail').length;
  const partial = applicable.filter((i) => i.status === 'partial').length;
  const untested = applicable.filter((i) => i.status === 'untested').length;
  const naCount  = audit.items.filter((i) => i.status === 'na').length;

  const tested    = pass + fail + partial;
  const passRate  = tested > 0 ? Math.round((pass / tested) * 100) : 0;
  const blockers  = audit.items.filter((i) => i.severity === 'blocker').length;
  const majors    = audit.items.filter((i) => i.severity === 'major').length;
  const compliant = fail === 0 && partial === 0 && untested === 0 && blockers === 0;

  return {
    page:      audit.page,
    total:     audit.items.length,
    pass,
    fail,
    partial,
    na:        naCount,
    untested,
    passRate,
    blockers,
    majors,
    compliant,
  };
}

/**
 * Summarizes an array of PageAudits into a suite-level report.
 */
export function summarizeSuite(audits: PageAudit[]): {
  totalPages:     number;
  compliantPages: number;
  suitePassRate:  number;
  totalBlockers:  number;
  totalMajors:    number;
  perPage:        AuditSummary[];
} {
  const perPage       = audits.map(summarizeAudit);
  const compliantPages = perPage.filter((s) => s.compliant).length;
  const allPasses     = perPage.reduce((sum, s) => sum + s.pass, 0);
  const allApplicable = perPage.reduce((sum, s) => sum + s.pass + s.fail + s.partial, 0);

  return {
    totalPages:     audits.length,
    compliantPages,
    suitePassRate:  allApplicable > 0 ? Math.round((allPasses / allApplicable) * 100) : 0,
    totalBlockers:  perPage.reduce((sum, s) => sum + s.blockers, 0),
    totalMajors:    perPage.reduce((sum, s) => sum + s.majors, 0),
    perPage,
  };
}

/**
 * Returns only the failing or partial items across a page audit — useful for
 * building a remediation backlog.
 */
export function getRemediationItems(audit: PageAudit): PageAuditItem[] {
  return audit.items.filter((i) => i.status === 'fail' || i.status === 'partial');
}

/**
 * Filters the checklist by category for targeted reviews.
 */
export function getChecksByCategory(category: AuditCategory): AuditCheckItem[] {
  return A11Y_CHECKLIST.filter((c) => c.category === category);
}

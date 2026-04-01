// ============================================================
// CapitalForge — PII Redaction Utility
// Masks sensitive values for logs, error messages, and API
// responses served to non-privileged users.
// ALL masking functions are pure — they never mutate input.
// ============================================================

// ── SSN ──────────────────────────────────────────────────────

/**
 * Masks a Social Security Number to `***-**-1234`.
 * Accepts formatted (`123-45-6789`) or raw (`123456789`) input.
 * Returns the original string if it does not match the SSN pattern.
 */
export function maskSSN(value: string): string {
  if (typeof value !== 'string') return value;

  // Strip formatting, validate length
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 9) return value;

  const last4 = digits.slice(-4);
  return `***-**-${last4}`;
}

// ── EIN ──────────────────────────────────────────────────────

/**
 * Masks an Employer Identification Number to `**-***1234`.
 * Accepts formatted (`12-3456789`) or raw (`123456789`) input.
 * Returns the original string if it does not match the EIN pattern.
 */
export function maskEIN(value: string): string {
  if (typeof value !== 'string') return value;

  const digits = value.replace(/\D/g, '');
  if (digits.length !== 9) return value;

  const last4 = digits.slice(-4);
  return `**-***${last4}`;
}

// ── Card number ───────────────────────────────────────────────

/**
 * Masks a payment card number to `****1234` (last 4 visible).
 * Accepts 13–19 digit card numbers with optional spaces/hyphens.
 * Returns the original string if the digit count is out of range.
 */
export function maskCardNumber(value: string): string {
  if (typeof value !== 'string') return value;

  const digits = value.replace(/[\s-]/g, '');
  if (digits.length < 13 || digits.length > 19) return value;

  const last4 = digits.slice(-4);
  return `****${last4}`;
}

// ── Email ─────────────────────────────────────────────────────

/**
 * Masks an email address to `j***@***.com`.
 *
 * Rules:
 * - Local part: first character visible, rest replaced with `***`
 * - Domain: TLD visible, sub-domains replaced with `***`
 * - Returns the original string if it does not contain `@`.
 *
 * Examples:
 *   john.doe@example.com  → j***@***.com
 *   a@b.co.uk             → a***@***.co.uk
 */
export function maskEmail(value: string): string {
  if (typeof value !== 'string') return value;

  const atIndex = value.indexOf('@');
  if (atIndex < 0) return value;

  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);

  if (!local || !domain) return value;

  // Mask local: keep first char
  const maskedLocal = local[0] + '***';

  // Mask domain: keep TLD (last segment after final dot)
  const dotIndex = domain.lastIndexOf('.');
  const maskedDomain = dotIndex > 0
    ? '***' + domain.slice(dotIndex)   // e.g. ***.com
    : '***';

  return `${maskedLocal}@${maskedDomain}`;
}

// ── Phone ────────────────────────────────────────────────────

/**
 * Masks a phone number to show only the last 4 digits: `***-***-1234`.
 * Accepts any reasonable phone format (digits, spaces, hyphens, plus, parens).
 * Returns original if fewer than 4 digits are present.
 */
export function maskPhone(value: string): string {
  if (typeof value !== 'string') return value;

  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return value;

  const last4 = digits.slice(-4);
  return `***-***-${last4}`;
}

// ── Bank account ──────────────────────────────────────────────

/**
 * Masks a bank account number: shows last 4 digits, masks the rest.
 * `****6789`
 */
export function maskBankAccount(value: string): string {
  if (typeof value !== 'string') return value;

  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return value;

  const last4 = digits.slice(-4);
  return `****${last4}`;
}

// ── Generic partial mask ──────────────────────────────────────

/**
 * Masks all but the last `visibleChars` characters of an arbitrary string.
 * Useful for API keys, tokens, etc.
 *
 * Example: maskPartial('supersecret', 4) → '*******cret'
 */
export function maskPartial(value: string, visibleChars = 4): string {
  if (typeof value !== 'string') return value;
  if (value.length <= visibleChars) return '*'.repeat(value.length);

  const masked = '*'.repeat(value.length - visibleChars);
  return masked + value.slice(-visibleChars);
}

// ── Object redaction ─────────────────────────────────────────

/**
 * Well-known PII field names mapped to their masking functions.
 * Keys are lower-cased for case-insensitive matching.
 */
const PII_FIELD_MASKERS: Record<string, (v: string) => string> = {
  ssn:               maskSSN,
  socialsecuritynumber: maskSSN,
  ein:               maskEIN,
  employeridentificationnumber: maskEIN,
  cardnumber:        maskCardNumber,
  creditcardnumber:  maskCardNumber,
  pan:               maskCardNumber,
  email:             maskEmail,
  emailaddress:      maskEmail,
  phone:             maskPhone,
  phonenumber:       maskPhone,
  mobile:            maskPhone,
  bankaccount:       maskBankAccount,
  bankaccountnumber: maskBankAccount,
  accountnumber:     maskBankAccount,
  routingnumber:     maskBankAccount,
  password:          (_) => '[REDACTED]',
  passwordhash:      (_) => '[REDACTED]',
  secret:            (_) => '[REDACTED]',
  token:             (v) => maskPartial(v, 4),
  apikey:            (v) => maskPartial(v, 4),
};

/**
 * Deep-walks `obj` and applies PII masking to any field whose
 * lower-cased key matches a known PII field name.
 *
 * Returns a new object — the original is never mutated.
 * Safe to pass directly to a logger or API response serializer.
 *
 * @param obj     - Any JSON-serializable value.
 * @param depth   - Internal recursion guard (max 20 levels).
 */
export function redactPII(obj: unknown, depth = 0): unknown {
  if (depth > 20) return obj;
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return (obj as unknown[]).map((item) => redactPII(item, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const normalizedKey = key.replace(/[_\-\s]/g, '').toLowerCase();
    const masker = PII_FIELD_MASKERS[normalizedKey];

    if (masker && typeof value === 'string') {
      result[key] = masker(value);
    } else {
      result[key] = redactPII(value, depth + 1);
    }
  }
  return result;
}

// ── Log-safe serializer ───────────────────────────────────────

/**
 * Serializes `obj` to a JSON string with PII fields redacted.
 * Drop-in replacement for `JSON.stringify` in logging contexts.
 */
export function safeStringify(obj: unknown): string {
  return JSON.stringify(redactPII(obj));
}

// ── Inline pattern detectors ──────────────────────────────────

/**
 * Scans a free-form string for embedded PII patterns and replaces
 * them with masked equivalents. Useful for sanitizing log messages
 * that may contain raw user input.
 */
export function redactInlineText(text: string): string {
  if (typeof text !== 'string') return text;

  // SSN pattern: XXX-XX-XXXX
  let result = text.replace(
    /\b\d{3}-\d{2}-(\d{4})\b/g,
    (_, last4: string) => `***-**-${last4}`,
  );

  // EIN pattern: XX-XXXXXXX
  result = result.replace(
    /\b\d{2}-(\d{3})(\d{4})\b/g,
    (_, _mid: string, last4: string) => `**-***${last4}`,
  );

  // Card numbers: 13–19 consecutive digits (with optional space/hyphen separators)
  result = result.replace(
    /\b(\d[\d\s-]{11,21}\d)\b/g,
    (match) => {
      const digits = match.replace(/[\s-]/g, '');
      if (digits.length >= 13 && digits.length <= 19) {
        return `****${digits.slice(-4)}`;
      }
      return match;
    },
  );

  return result;
}

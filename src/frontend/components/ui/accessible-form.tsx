'use client';

/**
 * AccessibleForm — Accessible form primitive components
 *
 * Provides properly labeled, ARIA-enhanced form components that satisfy
 * WCAG 2.1 AA Success Criteria:
 *  - 1.3.1 Info and Relationships (Level A)
 *  - 1.3.5 Identify Input Purpose (Level AA)
 *  - 3.3.1 Error Identification (Level A)
 *  - 3.3.2 Labels or Instructions (Level A)
 *  - 4.1.2 Name, Role, Value (Level A)
 *  - 4.1.3 Status Messages (Level AA)
 *
 * Features:
 *  - Visible label always associated via htmlFor/id
 *  - aria-required on required fields
 *  - aria-invalid + aria-describedby on error state
 *  - aria-describedby for hints/helper text
 *  - Announcer component for screen-reader-only dynamic messages
 *  - Focus management utilities
 */

import React, {
  createContext,
  useContext,
  useId,
  useRef,
  useEffect,
  forwardRef,
  ReactNode,
  HTMLAttributes,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
  LabelHTMLAttributes,
  FormHTMLAttributes,
} from 'react';

// ─── Field Context ────────────────────────────────────────────────────────────

interface FieldContextValue {
  inputId:       string;
  errorId:       string;
  hintId:        string;
  hasError:      boolean;
  hasHint:       boolean;
  required:      boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

function useFieldContext(): FieldContextValue {
  const ctx = useContext(FieldContext);
  if (!ctx) throw new Error('Form field components must be used inside <FormField>');
  return ctx;
}

// ─── FormField ────────────────────────────────────────────────────────────────

export interface FormFieldProps {
  /** Stable unique id prefix. Auto-generated if not provided. */
  id?: string;
  children: ReactNode;
  /** Error message string. Empty/undefined = no error state. */
  error?: string;
  /** Helper / hint text shown below the input */
  hint?: string;
  /** Mark field as required */
  required?: boolean;
  className?: string;
}

export function FormField({
  id: externalId,
  children,
  error,
  hint,
  required = false,
  className = '',
}: FormFieldProps) {
  const autoId  = useId();
  const baseId  = externalId ?? autoId.replace(/:/g, '');
  const inputId = `${baseId}-input`;
  const errorId = `${baseId}-error`;
  const hintId  = `${baseId}-hint`;

  return (
    <FieldContext.Provider
      value={{
        inputId,
        errorId,
        hintId,
        hasError:  Boolean(error),
        hasHint:   Boolean(hint),
        required,
      }}
    >
      <div className={`flex flex-col gap-1.5 ${className}`}>
        {children}

        {/* Hint text */}
        {hint && (
          <p id={hintId} className="text-xs text-gray-500 leading-relaxed">
            {hint}
          </p>
        )}

        {/* Error message */}
        {error && (
          <p
            id={errorId}
            role="alert"
            aria-live="polite"
            className="flex items-center gap-1.5 text-xs font-medium text-red-600"
          >
            {/* Error icon — decorative */}
            <svg
              aria-hidden="true"
              className="w-3.5 h-3.5 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

// ─── FormLabel ────────────────────────────────────────────────────────────────

export interface FormLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode;
  /**
   * Override the associated input id. Defaults to the id from FormField context.
   * Provide this when using FormLabel outside a FormField.
   */
  htmlFor?: string;
  /** Show required asterisk. Inferred from FormField context if inside one. */
  required?: boolean;
  /** Visually hide the label (still accessible to screen readers) */
  srOnly?: boolean;
}

export function FormLabel({
  children,
  htmlFor,
  required: requiredProp,
  srOnly = false,
  className = '',
  ...rest
}: FormLabelProps) {
  // Allow use outside FormField context (optional)
  const ctx = useContext(FieldContext);
  const forId   = htmlFor ?? ctx?.inputId;
  const isReq   = requiredProp !== undefined ? requiredProp : (ctx?.required ?? false);

  return (
    <label
      htmlFor={forId}
      className={[
        srOnly ? 'sr-only' : 'block text-sm font-medium text-gray-700',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
      {isReq && (
        <span
          aria-hidden="true"
          className="ml-1 text-red-500"
          title="Required"
        >
          *
        </span>
      )}
      {/* Screen-reader-only "required" announcement */}
      {isReq && <span className="sr-only">(required)</span>}
    </label>
  );
}

// ─── FormInput ────────────────────────────────────────────────────────────────

export interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Explicit id — if inside FormField, the field's inputId is used automatically */
  id?: string;
}

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  function FormInput({ id: externalId, className = '', ...rest }, ref) {
    const ctx    = useContext(FieldContext);
    const autoId = useId();
    const inputId = externalId ?? ctx?.inputId ?? autoId;

    const describedBy = [
      ctx?.hasHint  ? ctx.hintId  : null,
      ctx?.hasError ? ctx.errorId : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <input
        ref={ref}
        id={inputId}
        aria-required={ctx?.required || rest.required || undefined}
        aria-invalid={ctx?.hasError ? 'true' : undefined}
        aria-describedby={describedBy}
        className={[
          'block w-full rounded-lg border px-3 py-2 text-sm text-gray-900',
          'placeholder:text-gray-400',
          'focus:outline-none focus:ring-2 focus:ring-offset-0',
          ctx?.hasError
            ? 'border-red-400 bg-red-50 focus:ring-red-400'
            : 'border-surface-border bg-white focus:ring-brand-navy/50 hover:border-gray-300',
          'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400',
          'transition-colors duration-150',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      />
    );
  }
);

// ─── FormTextarea ─────────────────────────────────────────────────────────────

export interface FormTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  id?: string;
}

export const FormTextarea = forwardRef<HTMLTextAreaElement, FormTextareaProps>(
  function FormTextarea({ id: externalId, className = '', ...rest }, ref) {
    const ctx    = useContext(FieldContext);
    const autoId = useId();
    const inputId = externalId ?? ctx?.inputId ?? autoId;

    const describedBy = [
      ctx?.hasHint  ? ctx.hintId  : null,
      ctx?.hasError ? ctx.errorId : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <textarea
        ref={ref}
        id={inputId}
        aria-required={ctx?.required || rest.required || undefined}
        aria-invalid={ctx?.hasError ? 'true' : undefined}
        aria-describedby={describedBy}
        className={[
          'block w-full rounded-lg border px-3 py-2 text-sm text-gray-900 resize-y',
          'placeholder:text-gray-400',
          'focus:outline-none focus:ring-2 focus:ring-offset-0',
          ctx?.hasError
            ? 'border-red-400 bg-red-50 focus:ring-red-400'
            : 'border-surface-border bg-white focus:ring-brand-navy/50 hover:border-gray-300',
          'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400',
          'transition-colors duration-150',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      />
    );
  }
);

// ─── FormSelect ───────────────────────────────────────────────────────────────

export interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  id?: string;
}

export const FormSelect = forwardRef<HTMLSelectElement, FormSelectProps>(
  function FormSelect({ id: externalId, className = '', children, ...rest }, ref) {
    const ctx    = useContext(FieldContext);
    const autoId = useId();
    const inputId = externalId ?? ctx?.inputId ?? autoId;

    const describedBy = [
      ctx?.hasHint  ? ctx.hintId  : null,
      ctx?.hasError ? ctx.errorId : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <select
        ref={ref}
        id={inputId}
        aria-required={ctx?.required || rest.required || undefined}
        aria-invalid={ctx?.hasError ? 'true' : undefined}
        aria-describedby={describedBy}
        className={[
          'block w-full rounded-lg border px-3 py-2 text-sm text-gray-900',
          'focus:outline-none focus:ring-2 focus:ring-offset-0',
          ctx?.hasError
            ? 'border-red-400 bg-red-50 focus:ring-red-400'
            : 'border-surface-border bg-white focus:ring-brand-navy/50 hover:border-gray-300',
          'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400',
          'transition-colors duration-150',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      >
        {children}
      </select>
    );
  }
);

// ─── FormCheckbox ─────────────────────────────────────────────────────────────

export interface FormCheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label:  ReactNode;
  id?:    string;
  error?: string;
  hint?:  string;
}

export const FormCheckbox = forwardRef<HTMLInputElement, FormCheckboxProps>(
  function FormCheckbox({ label, id: externalId, error, hint, className = '', ...rest }, ref) {
    const autoId   = useId();
    const baseId   = externalId ?? autoId.replace(/:/g, '');
    const inputId  = `${baseId}-cb`;
    const errorId  = `${baseId}-cb-error`;
    const hintId   = `${baseId}-cb-hint`;

    const describedBy = [
      hint  ? hintId  : null,
      error ? errorId : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined;

    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        <div className="flex items-start gap-3">
          <input
            ref={ref}
            type="checkbox"
            id={inputId}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={describedBy}
            className="mt-0.5 w-4 h-4 rounded border-surface-border text-brand-navy
                       focus:ring-2 focus:ring-brand-navy/50 focus:ring-offset-0
                       transition-colors duration-150 cursor-pointer"
            {...rest}
          />
          <label
            htmlFor={inputId}
            className="text-sm text-gray-700 leading-snug cursor-pointer"
          >
            {label}
          </label>
        </div>
        {hint  && <p id={hintId}  className="text-xs text-gray-500 pl-7">{hint}</p>}
        {error && (
          <p id={errorId} role="alert" aria-live="polite"
             className="text-xs font-medium text-red-600 pl-7">
            {error}
          </p>
        )}
      </div>
    );
  }
);

// ─── FormRadioGroup ───────────────────────────────────────────────────────────

export interface RadioOption {
  value:    string;
  label:    ReactNode;
  disabled?: boolean;
  hint?:    string;
}

export interface FormRadioGroupProps {
  /** Group legend (visible heading for the radio group) */
  legend:    ReactNode;
  name:      string;
  options:   RadioOption[];
  value?:    string;
  onChange?: (value: string) => void;
  error?:    string;
  required?: boolean;
  className?: string;
  srOnlyLegend?: boolean;
}

export function FormRadioGroup({
  legend,
  name,
  options,
  value,
  onChange,
  error,
  required = false,
  className = '',
  srOnlyLegend = false,
}: FormRadioGroupProps) {
  const groupId = useId().replace(/:/g, '');
  const errorId = `${groupId}-error`;

  return (
    <fieldset
      className={`border-0 p-0 m-0 ${className}`}
      aria-required={required || undefined}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={error ? errorId : undefined}
    >
      <legend
        className={
          srOnlyLegend
            ? 'sr-only'
            : 'block text-sm font-medium text-gray-700 mb-2'
        }
      >
        {legend}
        {required && <span className="ml-1 text-red-500" aria-hidden="true">*</span>}
        {required && <span className="sr-only">(required)</span>}
      </legend>

      <div className="flex flex-col gap-2">
        {options.map((opt) => {
          const optId = `${groupId}-${opt.value}`;
          return (
            <div key={opt.value} className="flex items-start gap-3">
              <input
                type="radio"
                id={optId}
                name={name}
                value={opt.value}
                checked={value === opt.value}
                disabled={opt.disabled}
                onChange={(e) => e.target.checked && onChange?.(opt.value)}
                className="mt-0.5 w-4 h-4 border-surface-border text-brand-navy
                           focus:ring-2 focus:ring-brand-navy/50 focus:ring-offset-0
                           transition-colors duration-150 cursor-pointer"
              />
              <div className="flex flex-col gap-0.5">
                <label htmlFor={optId} className="text-sm text-gray-700 cursor-pointer leading-snug">
                  {opt.label}
                </label>
                {opt.hint && (
                  <span className="text-xs text-gray-500">{opt.hint}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p id={errorId} role="alert" aria-live="polite"
           className="mt-1.5 text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </fieldset>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

export interface FormProps extends FormHTMLAttributes<HTMLFormElement> {
  /**
   * When true, shows an error summary region at the top of the form.
   * Pass an array of error messages to populate it.
   */
  errors?: string[];
  /**
   * aria-label for the form (required when multiple forms exist on a page).
   */
  'aria-label'?: string;
  children: ReactNode;
}

export function Form({
  errors,
  children,
  className = '',
  ...rest
}: FormProps) {
  const summaryRef = useRef<HTMLDivElement>(null);

  // Move focus to error summary when errors appear
  useEffect(() => {
    if (errors && errors.length > 0 && summaryRef.current) {
      summaryRef.current.focus();
    }
  }, [errors]);

  return (
    <form
      noValidate // We handle validation ourselves with ARIA
      className={`flex flex-col gap-5 ${className}`}
      {...rest}
    >
      {/* Error summary region */}
      {errors && errors.length > 0 && (
        <div
          ref={summaryRef}
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className="rounded-lg border border-red-300 bg-red-50 p-4 focus:outline-none"
        >
          <h2 className="text-sm font-semibold text-red-800 mb-2">
            Please fix the following {errors.length} error{errors.length !== 1 ? 's' : ''}:
          </h2>
          <ul className="list-disc list-inside space-y-1">
            {errors.map((err, i) => (
              <li key={i} className="text-sm text-red-700">{err}</li>
            ))}
          </ul>
        </div>
      )}
      {children}
    </form>
  );
}

// ─── FormSection ──────────────────────────────────────────────────────────────

export interface FormSectionProps {
  /** Section heading — renders as <legend> if inside <fieldset>, else <h3> */
  title:       ReactNode;
  description?: ReactNode;
  children:    ReactNode;
  className?:  string;
}

export function FormSection({ title, description, children, className = '' }: FormSectionProps) {
  return (
    <fieldset className={`border-0 p-0 m-0 flex flex-col gap-4 ${className}`}>
      <div className="border-b border-surface-border pb-2">
        <legend className="text-base font-semibold text-gray-900">{title}</legend>
        {description && (
          <p className="mt-0.5 text-sm text-gray-500">{description}</p>
        )}
      </div>
      {children}
    </fieldset>
  );
}

// ─── LiveAnnouncer ────────────────────────────────────────────────────────────

/**
 * Invisible ARIA live region for announcing dynamic content to screen readers.
 *
 * Usage:
 *   <LiveAnnouncer message="Application saved successfully" politeness="polite" />
 *
 * Mount this once per page. Update `message` to trigger an announcement.
 * The message is automatically cleared after 1500ms to avoid repeated reads.
 */
export interface LiveAnnouncerProps {
  message:    string;
  politeness?: 'polite' | 'assertive';
}

export function LiveAnnouncer({ message, politeness = 'polite' }: LiveAnnouncerProps) {
  const [current, setCurrent] = React.useState('');

  useEffect(() => {
    if (!message) return;
    // Clear first, then set — forces screen readers to re-read even the same message
    setCurrent('');
    const tid = setTimeout(() => {
      setCurrent(message);
    }, 50);
    // Clear after announcement
    const clearTid = setTimeout(() => setCurrent(''), 1500);
    return () => { clearTimeout(tid); clearTimeout(clearTid); };
  }, [message]);

  return (
    <div
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {current}
    </div>
  );
}

// ─── VisuallyHidden ───────────────────────────────────────────────────────────

/**
 * Renders children that are visible to screen readers but not sighted users.
 * Equivalent to Tailwind's sr-only but as a component.
 */
export function VisuallyHidden({
  children,
  as: Tag = 'span',
}: {
  children: ReactNode;
  as?: keyof React.JSX.IntrinsicElements;
}) {
  return (
    <Tag className="sr-only">
      {children}
    </Tag>
  );
}

// ─── FormRow ──────────────────────────────────────────────────────────────────

/**
 * Lays out FormFields side-by-side on desktop, stacking on mobile.
 */
export function FormRow({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${className}`}>
      {children}
    </div>
  );
}

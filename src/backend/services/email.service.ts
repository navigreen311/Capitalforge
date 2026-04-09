// ============================================================
// CapitalForge — Email Service
//
// Unified email sending abstraction with dual-mode operation:
//   - Resend mode: when RESEND_API_KEY is set, sends via Resend API
//   - Console mode: graceful fallback that logs emails to console
//     when Resend is not configured (dev/test environments)
//
// Template functions for common transactional emails:
//   - sendAcknowledgmentRequest()  — acknowledgment signature request
//   - sendAPRExpiryWarning()       — APR expiry alert
//   - sendPaymentReminder()        — payment due reminder
//   - sendWelcomeEmail()           — new client welcome
//   - sendConsentRequest()         — consent re-request
//   - sendCollectionNotice()       — overdue invoice notice
//
// All template functions use the base sendEmail() method, which
// routes through Resend or console based on configuration.
// ============================================================

import logger from '../config/logger.js';

// ── Types ──────────────────────────────────────────────────────

export type EmailMode = 'resend' | 'console';

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  /** Reply-to address (optional) */
  replyTo?: string;
  /** BCC recipients (optional) */
  bcc?: string | string[];
  /** Custom tags for tracking (optional) */
  tags?: Array<{ name: string; value: string }>;
}

export interface SendEmailResult {
  /** Unique ID from the email provider, or a generated one for console mode */
  id: string;
  /** Delivery mode used */
  mode: EmailMode;
  /** Whether the send was successful */
  success: boolean;
}

export interface EmailClient {
  id: string;
  email: string;
  name: string;
  businessName?: string;
}

export interface EmailAdvisor {
  name: string;
  email: string;
  phone?: string;
}

export interface EmailCard {
  last4: string;
  issuer: string;
  aprExpiryDate: string;
  currentApr: string;
  newApr: string;
}

export interface EmailPayment {
  amount: number;
  dueDate: string;
  cardLast4: string;
  issuer: string;
  minimumPayment?: number;
}

export interface EmailInvoice {
  id: string;
  amount: number;
  dueDate: string;
  daysPastDue: number;
  description?: string;
}

// ── Configuration ──────────────────────────────────────────────

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL    = process.env.EMAIL_FROM ?? 'CapitalForge <noreply@capitalforge.com>';
const APP_NAME      = 'CapitalForge';
const APP_URL       = process.env.FRONTEND_URL ?? 'http://localhost:3000';

// ── Resend client (lazy-loaded) ────────────────────────────────

let _resendClient: unknown = null;
let _resendLoaded = false;

async function getResendClient(): Promise<unknown> {
  if (_resendLoaded) return _resendClient;
  _resendLoaded = true;

  if (!RESEND_API_KEY) {
    logger.info('[EmailService] No RESEND_API_KEY configured — using console fallback');
    return null;
  }

  try {
    const { Resend } = await import('resend');
    _resendClient = new Resend(RESEND_API_KEY);
    logger.info('[EmailService] Resend client initialized');
    return _resendClient;
  } catch {
    logger.warn('[EmailService] resend package not installed — using console fallback');
    return null;
  }
}

// ── Email wrapper (shared HTML layout) ─────────────────────────

function wrapInLayout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; color: #18181b; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { background: #1e293b; color: #ffffff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 600; }
    .body { padding: 32px; line-height: 1.6; }
    .body h2 { color: #1e293b; font-size: 18px; margin-top: 0; }
    .cta { display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin: 16px 0; }
    .footer { padding: 24px 32px; background: #f8fafc; color: #64748b; font-size: 12px; text-align: center; border-top: 1px solid #e2e8f0; }
    .alert-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 16px; margin: 16px 0; }
    .info-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 16px; margin: 16px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
    .detail-label { color: #64748b; font-size: 14px; }
    .detail-value { font-weight: 500; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th { text-align: left; padding: 8px 12px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; font-size: 13px; color: #64748b; }
    td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
  </style>
</head>
<body>
  <div style="padding: 20px 0;">
    <div class="container">
      <div class="header">
        <h1>${APP_NAME}</h1>
      </div>
      <div class="body">
        ${bodyHtml}
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
        <p>This is a transactional email. Please do not reply directly to this message.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ── EmailService ───────────────────────────────────────────────

export class EmailService {
  /**
   * Determine the active email mode based on available configuration.
   */
  async getMode(): Promise<EmailMode> {
    const client = await getResendClient();
    return client ? 'resend' : 'console';
  }

  // ── Base send ──────────────────────────────────────────────

  /**
   * Send an email via Resend (if configured) or log to console.
   */
  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const client = await getResendClient();

    if (client) {
      return this._sendViaResend(client, input);
    }
    return this._sendViaConsole(input);
  }

  // ── Template: Acknowledgment Request ───────────────────────

  /**
   * Send an acknowledgment signature request email.
   *
   * @param client   - Recipient client info
   * @param ackType  - Type of acknowledgment (e.g. "product_reality", "fee_schedule")
   */
  async sendAcknowledgmentRequest(
    client: EmailClient,
    ackType: string,
  ): Promise<SendEmailResult> {
    const ackLabel = ackType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const signUrl  = `${APP_URL}/acknowledgments/${client.id}?type=${ackType}`;

    const html = wrapInLayout(`${ackLabel} Acknowledgment Required`, `
      <h2>Acknowledgment Required: ${ackLabel}</h2>
      <p>Hi ${client.name},</p>
      <p>Before we can proceed with your ${client.businessName ? `<strong>${client.businessName}</strong> ` : ''}engagement, we need you to review and sign the <strong>${ackLabel}</strong> acknowledgment.</p>
      <div class="info-box">
        <strong>Why is this required?</strong>
        <p style="margin: 8px 0 0;">Federal regulations require that you acknowledge key product terms before we can submit any applications on your behalf. This protects both you and our advisory relationship.</p>
      </div>
      <p style="text-align: center;">
        <a href="${signUrl}" class="cta">Review &amp; Sign Acknowledgment</a>
      </p>
      <p style="color: #64748b; font-size: 13px;">If the button above doesn't work, copy and paste this URL into your browser:<br>${signUrl}</p>
    `);

    return this.sendEmail({
      to:      client.email,
      subject: `Action Required: ${ackLabel} Acknowledgment - ${APP_NAME}`,
      html,
    });
  }

  // ── Template: APR Expiry Warning ───────────────────────────

  /**
   * Send an APR expiry warning email listing affected cards.
   */
  async sendAPRExpiryWarning(
    client: EmailClient,
    cards: EmailCard[],
  ): Promise<SendEmailResult> {
    const cardRows = cards
      .map(
        (c) => `<tr>
          <td>${c.issuer}</td>
          <td>****${c.last4}</td>
          <td>${c.currentApr}</td>
          <td>${c.newApr}</td>
          <td>${c.aprExpiryDate}</td>
        </tr>`,
      )
      .join('\n');

    const html = wrapInLayout('APR Expiry Alert', `
      <h2>APR Expiry Alert</h2>
      <p>Hi ${client.name},</p>
      <p>One or more of your business credit cards have introductory APR periods that are expiring soon. Here are the details:</p>
      <div class="alert-box">
        <strong>Action recommended:</strong> Review your repayment strategy before the new rates take effect.
      </div>
      <table>
        <thead>
          <tr>
            <th>Issuer</th>
            <th>Card</th>
            <th>Current APR</th>
            <th>New APR</th>
            <th>Expiry Date</th>
          </tr>
        </thead>
        <tbody>
          ${cardRows}
        </tbody>
      </table>
      <p>Log in to your dashboard to review options for balance transfers, accelerated paydown, or restacking.</p>
      <p style="text-align: center;">
        <a href="${APP_URL}/dashboard/apr-expiry" class="cta">View APR Details</a>
      </p>
    `);

    return this.sendEmail({
      to:      client.email,
      subject: `APR Expiry Alert: ${cards.length} card${cards.length > 1 ? 's' : ''} affected - ${APP_NAME}`,
      html,
    });
  }

  // ── Template: Payment Reminder ─────────────────────────────

  /**
   * Send a payment due reminder for an upcoming card payment.
   */
  async sendPaymentReminder(
    client: EmailClient,
    payment: EmailPayment,
  ): Promise<SendEmailResult> {
    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(payment.amount);

    const minimumFormatted = payment.minimumPayment
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(payment.minimumPayment)
      : null;

    const html = wrapInLayout('Payment Reminder', `
      <h2>Payment Reminder</h2>
      <p>Hi ${client.name},</p>
      <p>This is a reminder that a payment is coming due on your business credit card:</p>
      <div class="info-box">
        <div style="margin-bottom: 8px;"><span class="detail-label">Card:</span> <strong>${payment.issuer} ****${payment.cardLast4}</strong></div>
        <div style="margin-bottom: 8px;"><span class="detail-label">Due Date:</span> <strong>${payment.dueDate}</strong></div>
        <div style="margin-bottom: 8px;"><span class="detail-label">Statement Balance:</span> <strong>${formattedAmount}</strong></div>
        ${minimumFormatted ? `<div><span class="detail-label">Minimum Payment:</span> <strong>${minimumFormatted}</strong></div>` : ''}
      </div>
      <p>To maintain your credit profile and avoid late fees, please ensure payment is made by the due date.</p>
      <p style="text-align: center;">
        <a href="${APP_URL}/dashboard/payments" class="cta">View Payment Details</a>
      </p>
    `);

    return this.sendEmail({
      to:      client.email,
      subject: `Payment Reminder: ${formattedAmount} due ${payment.dueDate} - ${APP_NAME}`,
      html,
    });
  }

  // ── Template: Welcome Email ────────────────────────────────

  /**
   * Send a welcome email to a newly onboarded client.
   */
  async sendWelcomeEmail(
    client: EmailClient,
    advisor: EmailAdvisor,
  ): Promise<SendEmailResult> {
    const html = wrapInLayout(`Welcome to ${APP_NAME}`, `
      <h2>Welcome to ${APP_NAME}!</h2>
      <p>Hi ${client.name},</p>
      <p>We're excited to have ${client.businessName ? `<strong>${client.businessName}</strong>` : 'you'} on board. Your dedicated advisor is ready to help you build and optimize your business credit portfolio.</p>
      <div class="info-box">
        <strong>Your Advisor</strong>
        <div style="margin-top: 8px;">
          <div><strong>${advisor.name}</strong></div>
          <div>${advisor.email}</div>
          ${advisor.phone ? `<div>${advisor.phone}</div>` : ''}
        </div>
      </div>
      <h3>Next Steps</h3>
      <ol>
        <li><strong>Complete your business profile</strong> — ensure all details are accurate for the best application outcomes.</li>
        <li><strong>Review and sign acknowledgments</strong> — required before we can submit any applications.</li>
        <li><strong>Schedule your strategy call</strong> — your advisor will walk you through the recommended credit stacking plan.</li>
      </ol>
      <p style="text-align: center;">
        <a href="${APP_URL}/dashboard" class="cta">Go to Your Dashboard</a>
      </p>
      <p style="color: #64748b; font-size: 13px;">If you have any questions, reply to this email or contact your advisor directly.</p>
    `);

    return this.sendEmail({
      to:      client.email,
      subject: `Welcome to ${APP_NAME} - Let's Get Started!`,
      html,
      replyTo: advisor.email,
    });
  }

  // ── Template: Consent Request ──────────────────────────────

  /**
   * Send a consent re-request email for a specific communication channel.
   *
   * @param client  - Recipient client info
   * @param channel - Communication channel (e.g. "email", "sms", "phone")
   */
  async sendConsentRequest(
    client: EmailClient,
    channel: string,
  ): Promise<SendEmailResult> {
    const channelLabel = channel.charAt(0).toUpperCase() + channel.slice(1);
    const consentUrl   = `${APP_URL}/consent/${client.id}?channel=${channel}`;

    const html = wrapInLayout(`${channelLabel} Consent Request`, `
      <h2>${channelLabel} Communication Consent</h2>
      <p>Hi ${client.name},</p>
      <p>We need your updated consent to continue communicating with you via <strong>${channelLabel.toLowerCase()}</strong> regarding your ${client.businessName ? `<strong>${client.businessName}</strong> ` : ''}account.</p>
      <div class="info-box">
        <strong>Why are we asking?</strong>
        <p style="margin: 8px 0 0;">Regulations require us to maintain current, documented consent for each communication channel. Your prior consent may have expired or needs renewal.</p>
      </div>
      <p>Please click the button below to review and update your consent preferences:</p>
      <p style="text-align: center;">
        <a href="${consentUrl}" class="cta">Update Consent Preferences</a>
      </p>
      <p style="color: #64748b; font-size: 13px;">If you do not update your preferences, we may be unable to send you important account updates via ${channelLabel.toLowerCase()}.</p>
    `);

    return this.sendEmail({
      to:      client.email,
      subject: `Action Required: Update Your ${channelLabel} Consent - ${APP_NAME}`,
      html,
    });
  }

  // ── Template: Collection Notice ────────────────────────────

  /**
   * Send an overdue invoice / collection notice.
   */
  async sendCollectionNotice(
    client: EmailClient,
    invoice: EmailInvoice,
  ): Promise<SendEmailResult> {
    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(invoice.amount);

    const html = wrapInLayout('Overdue Invoice Notice', `
      <h2>Overdue Invoice Notice</h2>
      <p>Hi ${client.name},</p>
      <p>Our records show that the following invoice remains unpaid and is now <strong>${invoice.daysPastDue} days past due</strong>:</p>
      <div class="alert-box">
        <div style="margin-bottom: 8px;"><span class="detail-label">Invoice ID:</span> <strong>${invoice.id}</strong></div>
        <div style="margin-bottom: 8px;"><span class="detail-label">Amount Due:</span> <strong>${formattedAmount}</strong></div>
        <div style="margin-bottom: 8px;"><span class="detail-label">Original Due Date:</span> <strong>${invoice.dueDate}</strong></div>
        <div><span class="detail-label">Days Past Due:</span> <strong>${invoice.daysPastDue}</strong></div>
        ${invoice.description ? `<div style="margin-top: 8px;"><span class="detail-label">Description:</span> ${invoice.description}</div>` : ''}
      </div>
      <p>Please arrange payment at your earliest convenience to avoid further collection activity. If you believe this notice was sent in error or if you need to discuss payment arrangements, please contact us immediately.</p>
      <p style="text-align: center;">
        <a href="${APP_URL}/dashboard/payments" class="cta">Make a Payment</a>
      </p>
      <p style="color: #64748b; font-size: 13px;">This is a formal notice. If payment has already been submitted, please disregard this message. It may take 1-2 business days for recent payments to be reflected.</p>
    `);

    return this.sendEmail({
      to:      client.email,
      subject: `Overdue Invoice: ${formattedAmount} - ${invoice.daysPastDue} Days Past Due - ${APP_NAME}`,
      html,
    });
  }

  // ── Private: Resend implementation ────────────────────────

  private async _sendViaResend(
    resend: unknown,
    input: SendEmailInput,
  ): Promise<SendEmailResult> {
    try {
      const result = await (resend as {
        emails: {
          send: (params: {
            from: string;
            to: string | string[];
            subject: string;
            html: string;
            reply_to?: string;
            bcc?: string | string[];
            tags?: Array<{ name: string; value: string }>;
          }) => Promise<{ data?: { id: string } | null; error?: { message: string } | null }>;
        };
      }).emails.send({
        from:     FROM_EMAIL,
        to:       input.to,
        subject:  input.subject,
        html:     input.html,
        reply_to: input.replyTo,
        bcc:      input.bcc,
        tags:     input.tags,
      });

      if (result.error) {
        logger.error('[EmailService] Resend send failed', {
          error: result.error.message,
          to:    Array.isArray(input.to) ? input.to.join(', ') : input.to,
        });
        return { id: '', mode: 'resend', success: false };
      }

      const emailId = result.data?.id ?? '';
      logger.info('[EmailService] Email sent via Resend', {
        id:      emailId,
        to:      Array.isArray(input.to) ? input.to.join(', ') : input.to,
        subject: input.subject,
      });

      return { id: emailId, mode: 'resend', success: true };
    } catch (err) {
      logger.error('[EmailService] Resend send threw', {
        error: err instanceof Error ? err.message : String(err),
        to:    Array.isArray(input.to) ? input.to.join(', ') : input.to,
      });
      return { id: '', mode: 'resend', success: false };
    }
  }

  // ── Private: Console fallback ─────────────────────────────

  private async _sendViaConsole(input: SendEmailInput): Promise<SendEmailResult> {
    const id = `console_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    logger.info('[EmailService] Email logged to console (no RESEND_API_KEY)', {
      id,
      to:      Array.isArray(input.to) ? input.to.join(', ') : input.to,
      subject: input.subject,
    });

    // Log the full email content at debug level for development visibility
    logger.debug('[EmailService] Email content', {
      id,
      to:      input.to,
      subject: input.subject,
      replyTo: input.replyTo,
      bcc:     input.bcc,
      // Truncate HTML to avoid log bloat — full template is in the source
      htmlLength: input.html.length,
    });

    return { id, mode: 'console', success: true };
  }
}

// ── Default singleton ──────────────────────────────────────────

export const emailService = new EmailService();

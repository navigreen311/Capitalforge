// ============================================================
// CapitalForge — AI Chat Service
//
// Provides portfolio-aware AI chat powered by Claude.
// Loads tenant context (businesses, applications, APR alerts,
// upcoming payments) and streams responses.
// ============================================================

import { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';
import logger from '../config/logger.js';

// ── Types ──────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message: string;
  conversationHistory?: ChatMessage[];
}

export interface ChatResponse {
  message: string;
  tokensUsed?: { input: number; output: number };
  latencyMs?: number;
}

interface PortfolioContext {
  businesses: Array<{
    id: string;
    legalName: string;
    dba: string | null;
    status: string;
    industry: string | null;
    annualRevenue: unknown;
    monthlyRevenue: unknown;
    fundingReadinessScore: number | null;
  }>;
  recentApplications: Array<{
    id: string;
    issuer: string;
    cardProduct: string;
    status: string;
    creditLimit: unknown;
    introAprExpiry: Date | null;
    businessName: string;
  }>;
  aprExpiryAlerts: Array<{
    id: string;
    issuer: string;
    cardProduct: string;
    introAprExpiry: Date | null;
    businessName: string;
    daysUntilExpiry: number;
  }>;
  upcomingPayments: Array<{
    id: string;
    issuer: string;
    dueDate: Date;
    minimumPayment: unknown;
    status: string;
  }>;
  summary: {
    totalBusinesses: number;
    activeApplications: number;
    aprAlertsCount: number;
    upcomingPaymentsCount: number;
  };
}

// ── Service ─────────────────────────────────────────────────────

export class ChatService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? new PrismaClient();
  }

  // ── Load portfolio context for system prompt ─────────────────

  async loadPortfolioContext(tenantId: string): Promise<PortfolioContext> {
    const now = new Date();
    const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    // Fetch businesses
    const businesses = await this.prisma.business.findMany({
      where: { tenantId },
      select: {
        id: true,
        legalName: true,
        dba: true,
        status: true,
        industry: true,
        annualRevenue: true,
        monthlyRevenue: true,
        fundingReadinessScore: true,
      },
      take: 50,
      orderBy: { updatedAt: 'desc' },
    });

    // Recent applications (last 30 days or active)
    const recentApplications = await this.prisma.cardApplication.findMany({
      where: {
        business: { tenantId },
        OR: [
          { status: { in: ['submitted', 'approved', 'pending_consent', 'draft'] } },
          { createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
        ],
      },
      select: {
        id: true,
        issuer: true,
        cardProduct: true,
        status: true,
        creditLimit: true,
        introAprExpiry: true,
        business: { select: { legalName: true } },
      },
      take: 50,
      orderBy: { updatedAt: 'desc' },
    });

    // APR expiry alerts (within 60 days)
    const aprExpiryCards = await this.prisma.cardApplication.findMany({
      where: {
        business: { tenantId },
        status: 'approved',
        introAprExpiry: { gte: now, lte: sixtyDaysFromNow },
      },
      select: {
        id: true,
        issuer: true,
        cardProduct: true,
        introAprExpiry: true,
        business: { select: { legalName: true } },
      },
      orderBy: { introAprExpiry: 'asc' },
    });

    // Upcoming payments (next 14 days)
    const upcomingPayments = await this.prisma.paymentSchedule.findMany({
      where: {
        repaymentPlan: { business: { tenantId } },
        status: 'upcoming',
        dueDate: { gte: now, lte: fourteenDaysFromNow },
      },
      select: {
        id: true,
        issuer: true,
        dueDate: true,
        minimumPayment: true,
        status: true,
      },
      take: 30,
      orderBy: { dueDate: 'asc' },
    });

    const aprAlerts = aprExpiryCards.map((c) => ({
      id: c.id,
      issuer: c.issuer,
      cardProduct: c.cardProduct,
      introAprExpiry: c.introAprExpiry,
      businessName: c.business.legalName,
      daysUntilExpiry: c.introAprExpiry
        ? Math.ceil((c.introAprExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 0,
    }));

    return {
      businesses,
      recentApplications: recentApplications.map((a) => ({
        id: a.id,
        issuer: a.issuer,
        cardProduct: a.cardProduct,
        status: a.status,
        creditLimit: a.creditLimit,
        introAprExpiry: a.introAprExpiry,
        businessName: a.business.legalName,
      })),
      aprExpiryAlerts: aprAlerts,
      upcomingPayments,
      summary: {
        totalBusinesses: businesses.length,
        activeApplications: recentApplications.filter((a) =>
          ['submitted', 'approved', 'pending_consent'].includes(a.status),
        ).length,
        aprAlertsCount: aprAlerts.length,
        upcomingPaymentsCount: upcomingPayments.length,
      },
    };
  }

  // ── Build system prompt with context ─────────────────────────

  buildSystemPrompt(context: PortfolioContext): string {
    const lines: string[] = [
      'You are CapitalForge AI, an intelligent assistant for corporate credit and funding advisors.',
      'You help advisors manage their client portfolios, track card applications, monitor APR expirations,',
      'and optimize funding stacks. Be concise, data-driven, and actionable in your responses.',
      '',
      '=== PORTFOLIO SUMMARY ===',
      `Total Businesses: ${context.summary.totalBusinesses}`,
      `Active Applications: ${context.summary.activeApplications}`,
      `APR Expiry Alerts (next 60 days): ${context.summary.aprAlertsCount}`,
      `Upcoming Payments (next 14 days): ${context.summary.upcomingPaymentsCount}`,
    ];

    if (context.businesses.length > 0) {
      lines.push('', '=== BUSINESSES ===');
      for (const b of context.businesses.slice(0, 20)) {
        lines.push(
          `- ${b.legalName}${b.dba ? ` (DBA: ${b.dba})` : ''} | Status: ${b.status} | Industry: ${b.industry ?? 'N/A'} | Readiness: ${b.fundingReadinessScore ?? 'N/A'}`,
        );
      }
    }

    if (context.recentApplications.length > 0) {
      lines.push('', '=== RECENT APPLICATIONS ===');
      for (const a of context.recentApplications.slice(0, 15)) {
        lines.push(
          `- ${a.businessName}: ${a.issuer} ${a.cardProduct} | Status: ${a.status} | Limit: ${a.creditLimit ?? 'N/A'}`,
        );
      }
    }

    if (context.aprExpiryAlerts.length > 0) {
      lines.push('', '=== APR EXPIRY ALERTS ===');
      for (const alert of context.aprExpiryAlerts) {
        lines.push(
          `- ${alert.businessName}: ${alert.issuer} ${alert.cardProduct} | Expires in ${alert.daysUntilExpiry} days (${alert.introAprExpiry?.toISOString().split('T')[0] ?? 'N/A'})`,
        );
      }
    }

    if (context.upcomingPayments.length > 0) {
      lines.push('', '=== UPCOMING PAYMENTS ===');
      for (const p of context.upcomingPayments.slice(0, 15)) {
        lines.push(
          `- ${p.issuer} | Due: ${p.dueDate.toISOString().split('T')[0]} | Min Payment: $${p.minimumPayment}`,
        );
      }
    }

    lines.push(
      '',
      '=== INSTRUCTIONS ===',
      'When answering questions:',
      '- Reference specific client names and data from the portfolio above',
      '- Provide actionable recommendations with clear next steps',
      '- If asked about clients needing attention, prioritize by APR expirations, payment due dates, and readiness scores',
      '- For restack candidates, look for businesses with approved cards where intro APR is expiring soon',
      '- Keep responses focused and professional',
    );

    return lines.join('\n');
  }

  // ── Send chat message (streaming) ────────────────────────────

  async *streamChat(
    tenantId: string,
    request: ChatRequest,
  ): AsyncGenerator<string, ChatResponse | void, undefined> {
    if (!config.anthropic.apiKey) {
      const fallback =
        'AI Chat requires an Anthropic API key. Configure it in Settings \u2192 Integrations.';
      yield fallback;
      return { message: fallback, tokensUsed: { input: 0, output: 0 }, latencyMs: 0 };
    }

    const startTime = Date.now();

    // Load portfolio context
    const context = await this.loadPortfolioContext(tenantId);
    const systemPrompt = this.buildSystemPrompt(context);

    // Build messages array
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (request.conversationHistory) {
      for (const msg of request.conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: 'user', content: request.message });

    try {
      // Dynamic import to avoid requiring the SDK when key is not set
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: config.anthropic.apiKey });

      const stream = await client.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages,
      });

      let fullMessage = '';
      let inputTokens = 0;
      let outputTokens = 0;

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          fullMessage += event.delta.text;
          yield event.delta.text;
        }
      }

      // Get final usage from the stream
      const finalMessage = await stream.finalMessage();
      inputTokens = finalMessage.usage?.input_tokens ?? 0;
      outputTokens = finalMessage.usage?.output_tokens ?? 0;

      const latencyMs = Date.now() - startTime;

      // Log generation
      await this.logGeneration(tenantId, 'chat', 'claude-sonnet-4-20250514', inputTokens, outputTokens, latencyMs);

      return {
        message: fullMessage,
        tokensUsed: { input: inputTokens, output: outputTokens },
        latencyMs,
      };
    } catch (error) {
      logger.error('Chat stream error', { error, tenantId });
      const errorMsg = 'Sorry, I encountered an error processing your request. Please try again.';
      yield errorMsg;
      return { message: errorMsg, tokensUsed: { input: 0, output: 0 }, latencyMs: Date.now() - startTime };
    }
  }

  // ── Non-streaming fallback ───────────────────────────────────

  async chat(tenantId: string, request: ChatRequest): Promise<ChatResponse> {
    let fullMessage = '';
    let result: ChatResponse | void;

    for await (const chunk of this.streamChat(tenantId, request)) {
      fullMessage += chunk;
    }

    return result ?? { message: fullMessage };
  }

  // ── Log AI generation to database ────────────────────────────

  private async logGeneration(
    tenantId: string,
    feature: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    latencyMs: number,
  ): Promise<void> {
    try {
      await this.prisma.aiGenerationLog.create({
        data: {
          tenantId,
          feature,
          model,
          inputTokens,
          outputTokens,
          latencyMs,
        },
      });
    } catch (error) {
      // Don't let logging failures break chat
      logger.warn('Failed to log AI generation', { error, tenantId, feature });
    }
  }
}

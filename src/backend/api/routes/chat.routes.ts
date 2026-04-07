// ============================================================
// CapitalForge — AI Chat Routes
//
// POST /api/chat — Streaming AI chat with portfolio context
//
// Accepts { message, conversationHistory } and returns a
// Server-Sent Events stream of text chunks from Claude.
// Falls back to a mock response when ANTHROPIC_API_KEY is unset.
// ============================================================

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z, ZodError } from 'zod';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { ChatService, type ChatMessage } from '../../services/chat.service.js';
import logger from '../../config/logger.js';

// ── Router & lazy singletons ────────────────────────────────────

export const chatRouter = Router();

let _chatService: ChatService | null = null;
let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!_prisma) _prisma = new PrismaClient();
  return _prisma;
}

function getChatService(): ChatService {
  if (!_chatService) _chatService = new ChatService(getPrisma());
  return _chatService;
}

// ── Validation ──────────────────────────────────────────────────

const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(10000),
});

const ChatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required').max(10000, 'Message too long'),
  conversationHistory: z.array(ChatMessageSchema).max(50).optional(),
});

// ── POST /api/chat — Streaming AI chat ──────────────────────────

chatRouter.post(
  '/',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.tenant?.tenantId;
    if (!tenantId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing tenant context' } });
      return;
    }

    // Validate body
    let body: z.infer<typeof ChatRequestSchema>;
    try {
      body = ChatRequestSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: err.errors,
          },
        });
        return;
      }
      throw err;
    }

    logger.info('Chat request received', { tenantId, messageLength: body.message.length });

    // Set up SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    const service = getChatService();

    try {
      const generator = service.streamChat(tenantId, {
        message: body.message,
        conversationHistory: body.conversationHistory as ChatMessage[] | undefined,
      });

      for await (const chunk of generator) {
        // SSE format: data: <text>\n\n
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }

      // Signal end of stream
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      logger.error('Chat streaming error', { error, tenantId });

      // If headers already sent, send error via SSE
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: 'An error occurred during streaming' })}\n\n`);
        res.end();
      } else {
        res.status(500).json({
          success: false,
          error: { code: 'CHAT_ERROR', message: 'Failed to process chat request' },
        });
      }
    }
  },
);

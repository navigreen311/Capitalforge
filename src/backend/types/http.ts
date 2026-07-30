// ============================================================
// CapitalForge — HTTP request typing
//
// @types/express 5.x types path parameters as `string | string[]`:
//
//   interface ParamsDictionary {
//     [key: string]: string | string[];
//   }
//
// Express 5 can populate an array when the same parameter name appears
// more than once in a route path (e.g. '/:id/:id'). No route in this
// application does that, so every `req.params.x` is a plain string at
// runtime — but the declared union made ~166 call sites fail to compile
// wherever a param was passed somewhere expecting a string.
//
// This alias narrows the default parameter dictionary to Record<string,
// string> while leaving the other generics alone. Route modules import
// `Request` from here instead of from 'express'; that is a single
// import-line change per file, is purely a compile-time narrowing, and
// emits no runtime code.
//
// If a route ever does need a repeated path parameter, annotate that one
// handler explicitly: `Request<{ id: string[] }>`.
// ============================================================

import type { Request as ExpressRequest } from 'express';
import type { ParsedQs } from 'qs';

/** Path parameters as this application actually uses them. */
export type PathParams = Record<string, string>;

/**
 * Express's Request with the parameter dictionary narrowed to strings.
 * Generic positions match express's own ordering so existing explicit
 * annotations keep working.
 */
export type Request<
  P = PathParams,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = ParsedQs,
> = ExpressRequest<P, ResBody, ReqBody, ReqQuery>;

export type { Response, NextFunction, Router } from 'express';

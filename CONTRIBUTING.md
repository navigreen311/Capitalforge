# Contributing to CapitalForge

Copyright © 2026 Green Companies LLC. All rights reserved.

This is a proprietary codebase. Contributions are made by authorized team members and contractors only. External contributions are not accepted without a signed contributor agreement.

---

## Table of Contents

- [Branch Naming](#branch-naming)
- [Commit Conventions](#commit-conventions)
- [Pull Request Template](#pull-request-template)
- [Code Review Checklist](#code-review-checklist)
- [Testing Requirements](#testing-requirements)
- [Documentation Requirements](#documentation-requirements)
- [Development Workflow](#development-workflow)

---

## Branch Naming

All branches must follow this naming scheme:

| Type | Pattern | Example |
|------|---------|---------|
| AI-assisted feature | `ai-feature/<slug>` | `ai-feature/apr-alert-engine` |
| Human feature | `feature/<slug>` | `feature/state-law-mapper` |
| Bug fix | `fix/<slug>` | `fix/consent-revocation-race` |
| Chore / tooling | `chore/<slug>` | `chore/update-prisma-schema` |
| Documentation | `docs/<slug>` | `docs/api-reference-update` |
| Test | `test/<slug>` | `test/e2e-compliance-flow` |
| Hotfix (production) | `hotfix/<slug>` | `hotfix/rbac-bypass-critical` |

Rules:
- Slugs use lowercase kebab-case only
- Maximum 60 characters including the prefix
- Never commit directly to `master` or `main`
- Delete the branch after the PR is merged

---

## Commit Conventions

CapitalForge follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

### Format

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

### Types

| Type | When to Use |
|------|------------|
| `feat` | New feature or module |
| `fix` | Bug fix |
| `docs` | Documentation changes only |
| `test` | Adding or correcting tests |
| `refactor` | Code change that is neither a fix nor a feature |
| `chore` | Build system, tooling, dependencies |
| `perf` | Performance improvement |
| `ci` | CI/CD pipeline changes |
| `revert` | Revert a previous commit |

### Scopes

Use the module name or pillar: `auth`, `credit`, `consent`, `funding`, `compliance`, `platform`, `financial`, `voiceforge`, `vaf`, `infra`, `prisma`, `ci`.

### Examples

```
feat(consent): add TCPA consent gate to card application submission
fix(apr-alert): deduplicate 30-day alert when round updated same day
docs(api): add Section 1071 export endpoint to api.md
test(e2e): add compliance dossier assembly flow
chore(prisma): add index on ledger_events.tenantId
```

### Rules

- Subject line: imperative mood, lowercase, no trailing period, 72 characters max
- Breaking changes: append `!` after type/scope and include `BREAKING CHANGE:` in footer
- Reference issues: `Closes #123` or `Refs #456` in the footer

---

## Pull Request Template

When opening a PR, fill in all sections:

```markdown
## Summary

<!-- What does this PR do? 2-4 sentences max. -->

## Why

<!-- What problem does it solve or what requirement does it fulfill? -->

## How

<!-- Key implementation decisions. Link to relevant files or functions. -->

## Tests

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated (if applicable)
- [ ] E2E test coverage confirmed
- [ ] `npm test` passes locally
- [ ] `npm run lint` passes locally
- [ ] `npx tsc --noEmit` passes locally

## Risks

<!-- Any regressions, migrations, breaking API changes, or deployment considerations? -->

## Screenshots / Evidence

<!-- For UI changes or compliance workflow changes, attach screenshots or test output. -->
```

---

## Code Review Checklist

Reviewers must verify all applicable items before approving.

### Correctness

- [ ] Logic is correct and handles edge cases
- [ ] Error paths return appropriate HTTP status codes and `ApiResponse` error envelopes
- [ ] No silent failures — errors are logged or surfaced
- [ ] State machine transitions are exhaustive and guarded

### Security

- [ ] No secrets, credentials, or PII in code or logs
- [ ] All new routes have `requireAuth()`, `tenantMiddleware()`, and `rbacMiddleware()` applied
- [ ] All request bodies validated with Zod — no raw `req.body` access in handlers
- [ ] PII fields (SSN, DOB, EIN) encrypted before storage
- [ ] New models have `tenantId` and are included in the Prisma tenant-scope middleware

### Architecture

- [ ] New services follow the existing service-layer pattern (no DB access in route handlers)
- [ ] Domain state changes emit typed events to the canonical event bus
- [ ] New event types are added to the Event Type Registry in `docs/architecture.md`
- [ ] No cross-tenant data access introduced

### Testing

- [ ] Unit tests cover the happy path and at least one error path per function
- [ ] Integration tests cover any new DB queries or Redis interactions
- [ ] E2E tests updated if a user-facing flow changed
- [ ] Coverage does not decrease

### Documentation

- [ ] JSDoc added to all exported functions and service classes
- [ ] `docs/api.md` updated for any new or changed endpoints
- [ ] `docs/all-modules.md` updated if a module was added or significantly changed
- [ ] `CHANGELOG.md` entry added under `[Unreleased]`

### Performance

- [ ] No N+1 query patterns introduced
- [ ] New DB queries have appropriate indexes (add migration if needed)
- [ ] No synchronous I/O on the hot path

---

## Testing Requirements

Every PR must meet these testing gates before merge:

### Unit Tests

- All new service functions must have unit tests in `tests/unit/`
- Pure functions: 100% branch coverage expected
- Mocked dependencies: use Vitest `vi.mock()` — no live DB/Redis calls in unit tests
- Test file naming: `<module-name>.service.test.ts`

### Integration Tests

Required for:
- New Prisma queries or schema changes
- New Redis operations
- New BullMQ job definitions

Location: `tests/integration/`
Infrastructure: must use `docker-compose up -d` environment

### E2E Tests

Required for:
- Any change to a user-facing workflow (onboarding, funding, compliance)
- New compliance gates or state machine transitions
- VoiceForge or VisionAudioForge pipeline changes

Location: `tests/e2e/`
Infrastructure: none required (mocked Prisma via `makePrismaMockFor()`)

### Coverage Targets

| Scope | Target |
|-------|--------|
| Overall statements | >= 80% |
| Service layer | >= 90% |
| Compliance-critical paths | 100% |

Run coverage: `npm run test:coverage`

---

## Documentation Requirements

### Always Required

- **CHANGELOG.md** — Add an entry under `## [Unreleased]` for every user-visible change
- **JSDoc** — All exported functions, classes, and types

### Required When Applicable

| Change | Required Doc Update |
|--------|-------------------|
| New API endpoint | `docs/api.md`, `docs/api-quick-reference.md` |
| New module | `docs/all-modules.md` |
| New event type | Event Type Registry in `docs/architecture.md` |
| New environment variable | `.env.example`, `docs/deploy.md` Secrets Reference |
| New compliance control | `docs/compliance.md` |
| New security control | `docs/security.md` |
| Deployment change | `docs/deploy.md` |

### Prohibited

- Do not commit `.env` files
- Do not commit `node_modules/`
- Do not commit build artifacts (`dist/`, `.next/`)
- Do not add secrets, API keys, or credentials to any documentation file

---

## Development Workflow

### Standard Flow

```bash
# 1. Create your branch
git checkout master && git pull
git checkout -b ai-feature/your-feature-slug

# 2. Start infrastructure
npm run docker:up

# 3. Develop
npm run dev          # backend + frontend
npm run test:watch   # tests in watch mode

# 4. Before pushing
npm run lint
npx tsc --noEmit
npm test

# 5. Push and open PR
git push -u origin ai-feature/your-feature-slug
# Open PR against master via GitHub
```

### AI-Assisted Development

This project uses Claude Code for AI-assisted development. See [`CLAUDE.md`](CLAUDE.md) for:

- Prompt patterns and command reference
- Context injection strategy
- Subagent and worktree patterns for parallel feature development
- Extended thinking levels: `think` / `think hard` / `think harder` / `ultrathink`

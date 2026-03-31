# code-review — Structured Example-Driven Code Review

Perform a structured, example-driven review for architecture, correctness, security, performance, and maintainability.

## Arguments

- **paths**: `$ARGUMENTS` — file paths or directories to review
- **style_examples**: (optional) exemplary files to learn style/conventions from
- **severity_threshold**: info | warning | error — minimum severity to report (default: warning)

## Process

### 1. Learn Style from Examples
- If style_examples provided, read those files first.
- Identify core design patterns, naming conventions, error handling style, and architectural decisions.
- Use these as the baseline for evaluation.

### 2. Review Against Checklist

For each file in paths, evaluate against:

**Architecture & Design**
- [ ] Single responsibility / clear module boundaries
- [ ] Appropriate abstractions (not over/under-engineered)
- [ ] Consistent with project patterns

**Correctness**
- [ ] Logic errors, off-by-one, null/undefined handling
- [ ] Edge cases covered
- [ ] Error handling is appropriate (not swallowed, not excessive)

**Security**
- [ ] No hardcoded secrets or credentials
- [ ] Input validation at system boundaries
- [ ] SQL injection, XSS, CSRF protections where applicable
- [ ] Auth/authz checks present where needed

**Performance**
- [ ] No unnecessary re-renders, DB queries, or API calls
- [ ] Appropriate caching or memoization
- [ ] No N+1 query patterns

**Maintainability**
- [ ] Clear naming (variables, functions, files)
- [ ] Reasonable file size (not monolithic)
- [ ] Tests exist or are clearly needed

**Compliance (for this project)**
- [ ] No PII logged without consent
- [ ] Financial data handling follows documented patterns
- [ ] Regulatory disclaimers present where needed

### 3. Produce Issues
- Each issue includes: severity, file:line, description, suggested fix (patch if possible).
- Group by severity: error → warning → info.

### 4. Summary
- Total issues by severity.
- Top 3 priorities to fix.
- Overall assessment: approve / approve-with-comments / request-changes.

## Output

```
## REVIEW SUMMARY
- Errors: X | Warnings: X | Info: X
- Verdict: <approve | approve-with-comments | request-changes>

## ISSUES
### Errors
<issues with patches>

### Warnings
<issues with patches>

## TOP PRIORITIES
1. ...
2. ...
3. ...
```

Output should be ready to paste as a PR comment.

## Example Invocation

```
/code-review src/services/ style_examples=src/services/auth.service.ts severity_threshold=warning
```

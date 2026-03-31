# impl-feature — Plan and Implement a Complete Feature

Plan and implement a complete feature end-to-end (design → code → tests → docs → demo) in its own branch.

## Arguments

- **feature_name**: `$ARGUMENTS` — kebab-case short name for the feature
- **scope**: ui | api | fullstack | agent | infra
- **acceptance_criteria**: bullet list or Gherkin-style text
- **tech_constraints**: (optional) stack limits, integrations, compliance requirements
- **priority**: p0 | p1 | p2
- **perf_targets**: (optional) performance goals (latency, throughput, etc.)
- **security_notes**: (optional) security or compliance considerations

## Process

### 1. Understand & Plan
- Summarize inputs and clarify ambiguities (batch 3–5 questions max).
- Write a **mini-PRD**: problem statement, target users, success metrics, constraints, risks.
- Outline **architecture**: components, data model, APIs, sequence diagrams (Mermaid OK).
- Define **acceptance tests** derived from criteria.

### 2. Branch & Optional Worktree
- Create and checkout branch: `ai-feature/${feature_name}`
- If parallel work benefits, create a git worktree and work inside it.
- Explain all git commands run.

### 3. Implementation
- Modify all necessary layers according to **scope** (ui, api, fullstack, agent, infra).
- Keep atomic **Conventional Commits** (`feat:`, `fix:`, `refactor:`, etc.).
- Prefer small, modular files with clear naming and boundaries.

### 4. Tests
- Create or extend **unit + integration tests** aligned with acceptance criteria.
- Ensure the test command passes: provide the exact command.
- Target meaningful coverage — not just line count.

### 5. Verification
- Build and run the app locally.
- Perform local smoke tests.
- Write a short **demo script** (commands + URLs).

### 6. Docs
- Update `README.md` with new feature info.
- Add `docs/${feature_name}.md` (overview, architecture, endpoints, env vars).
- Update `CHANGELOG.md`.

### 7. Deliverables
- Summary of changes, how to run, test results, known tradeoffs.
- Final output block:

```
## IMPLEMENTED
<what was built>

## TESTED
<test results and commands>

## HOW TO RUN
<exact steps to run locally>
```

## Error Handling
- On failures: show logs, propose fixes, retry.
- For missing info: make clearly labeled `ASSUMPTION`s and explain how to change later.

## Example Invocation

```
/impl-feature credit-risk-calculator scope=fullstack acceptance_criteria="Given a business profile, When risk is calculated, Then a score 0-100 is returned with breakdown" priority=p0 security_notes="No PII in logs"
```

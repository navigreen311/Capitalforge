# test-suite — Create or Extend Automated Test Suites

Create or extend an automated test suite (unit, integration, e2e) and wire it into CI if requested.

## Arguments

- **target**: `$ARGUMENTS` — file, module, or feature area to test
- **coverage_goal**: target coverage percentage (e.g., 80%)
- **test_kinds**: unit | integration | e2e | all
- **ci_provider**: (optional) github-actions | gitlab-ci | none
- **seed_data**: (optional) path to fixtures or seed data description

## Process

### 1. Inventory
- Scan existing tests for the target area.
- Identify what is already covered and what gaps exist.
- List existing test frameworks and conventions in use.

### 2. Gap Analysis
- Map acceptance criteria or feature behavior to required test cases.
- Identify missing happy-path, error-path, and edge-case tests.
- Prioritize by risk and impact.

### 3. Write Tests
- Add tests following existing framework conventions.
- Include proper setup/teardown and fixture management.
- Use descriptive test names that explain the scenario.
- Group tests logically by feature or module.

### 4. Fixtures & Seed Data
- Create or extend test fixtures and factory functions.
- Ensure teardown cleans up state (no test pollution).
- Use seed_data if provided, or generate representative data.

### 5. Test Scripts
- Add or update npm/make scripts for running tests.
- Provide commands for: all tests, specific suite, with coverage.
- Example: `npm test`, `npm run test:unit`, `npm run test:integration`

### 6. CI Configuration (if ci_provider specified)
- Generate or update CI workflow file.
- Include: install, lint, test, coverage upload steps.
- Add caching for dependencies.

### 7. Run & Summarize
- Execute the full test suite.
- Report: total tests, passed, failed, coverage %.
- List any flaky or skipped tests with rationale.

## Output

```
## TEST RESULTS
- Total: X | Passed: X | Failed: X | Skipped: X
- Coverage: X%

## NEW TESTS ADDED
<list of test files and what they cover>

## COMMANDS
<exact commands to run tests>
```

## Example Invocation

```
/test-suite src/services/risk-engine coverage_goal=85% test_kinds=unit,integration ci_provider=github-actions
```

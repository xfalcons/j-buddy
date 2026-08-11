# Contributing to J-Buddy

Thanks for your interest in contributing! This guide covers what we expect in pull requests.

For the full rationale behind these guidelines, see the [PR Contribution Guidelines ADR](/docs/adr/pr-contribution-guidelines.md).

## Pull Request Guidelines

Every PR must address the following in its description. The [PR template](/.github/pull_request_template.md) will prompt you for each section.

### 0. Discord Discussion URL

We strongly recommend including a Discord Discussion URL in the PR body (e.g. `https://discord.com/channels/...`). Discussing your idea in Discord before opening a PR helps align on direction and avoids wasted effort. If no Discord discussion exists, explain the context directly in the PR description.

### 1. What problem does this solve?

Describe the pain point or requirement in plain language. Link the related issue.

### 2. At a Glance

Provide an ASCII diagram showing the high-level flow or where your change fits in the system. For docs-only or trivial changes, write "N/A".

### 3. Prior Art & Industry Research

**Required for architectural, runtime, agent, scheduling, delivery, or persistence changes.** For docs-only, chore, CI, release, or trivial bug fixes, write "Not applicable" with a brief reason.

Include links to relevant source code, documentation, or discussions. If neither project addresses the problem, state that explicitly with evidence.

### 4. Proposed Solution

Describe your technical approach, architecture decisions, and key implementation details.

### 5. Why This Approach

Explain why you chose this approach over the alternatives found in your research. Be explicit about:

- Tradeoffs you accepted
- Known limitations
- How this could evolve in the future

### 6. Alternatives Considered

List approaches you evaluated but did not choose, and explain why they were rejected.

### 7. Validation

Pick the checks relevant to your PR type:

- **Extension,API,WebApp changes:** `npm run check`, `npm run test`, `npm run build`
- **CI/workflow changes:** workflow syntax validation, dry-run where possible
- **Docs-only changes:** links are valid, renders correctly in GitHub preview

Describe any manual testing performed and add unit tests for new functionality.

## Why We Require Prior Art Research

J-Buddy is a young project. We want every design decision to be informed by what's already working in production elsewhere. This:

- Prevents reinventing the wheel
- Surfaces better patterns we might not have considered
- Documents the design space for future contributors
- Makes reviews faster — reviewers don't have to do the research themselves

## Development Setup

### Chrome Extension

```bash
cd japanese-alchemy-chrome-extension
npm install
npm run build   # 輸出至 dist/
```

### Hosting (API Server)

```bash
cd japanese-alchemy-hosting/functions
cp secrets.example secrets.json
# update to your settings
npm install
npm run build
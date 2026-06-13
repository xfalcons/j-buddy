---
name: J-Buddy
last_updated: 2026-06-08
---

# J-Buddy Strategy

## Target problem

Japanese learners can look up words and grammar, but existing tools give formal, textbook-style explanations disconnected from real usage. The gap between "looking something up" and "understanding it well enough to actually use it" is where learners get stuck.

## Our approach

Ground every explanation in the real text the user is actually reading — so vocabulary and grammar are never taught in isolation, but always in the context where the learner encountered them. Then carry that context forward into spaced review, so the "how and where to use it" survives beyond the initial lookup.

## Who it's for

**Primary:** Intermediate Japanese learners who read real Japanese web content (news, blogs, forums) around topics they care about. They're hiring J-Buddy to actually learn from what they read — not just decrypt it.

## Key metrics

- **Weekly active explainers** — unique users who trigger an analysis each week (Firebase Functions logs)
- **Save rate** — percentage of explained items that get saved for review (Firestore saves / Function calls)
- **Review streak length** — average consecutive days a user reviews saved items (webapp/app usage)
- **Retention at 30 days** — percentage of users still active (explaining or reviewing) 30 days after first use (user activity)

## Tracks

### In-context reading experience

The Chrome extension's core loop: select text on any Japanese webpage, get AI analysis with grammar, vocabulary, and real-usage context in the side panel.

_Why it serves the approach:_ This is where "ground every explanation in real text" happens — the user never leaves the content they're reading.

### Spaced review & retention

The webapp (and future mobile app) where saved items get reviewed with the original context preserved.

_Why it serves the approach:_ Carries the "how and where to use it" forward through review, so learning survives beyond the initial lookup.

### Explanation quality

The LLM service layer, prompt engineering, streaming pipeline, and provider flexibility.

_Why it serves the approach:_ The approach only works if explanations are genuinely better than a dictionary — natural usage examples, grammar in context, and readable formatting are the product's core value.

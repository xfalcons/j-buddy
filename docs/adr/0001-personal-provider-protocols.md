# Support explicit personal-provider protocols

**Status:** Accepted

Personal provider profiles support explicit Chat Completions-compatible and Responses-compatible protocols rather than arbitrary endpoint URLs. The protocol determines a derived endpoint and request/stream parser; Responses requests opt out of server-side storage, preserve the safe non-streaming fallback, and allow a manual model ID when `/models` discovery is unavailable. This keeps providers interoperable without weakening the profile's origin-permission boundary or silently retaining learner text.

## Considered Options

- Arbitrary endpoint URLs — rejected because protocol selection supplies the required route while preserving a clear, testable compatibility contract.
- Require `/models` for every provider — rejected because a Responses-compatible provider can validly analyze text without offering model discovery.

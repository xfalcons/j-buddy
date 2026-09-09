---
title: AWS Bedrock LLM Provider
date: 2026-09-07
type: plan
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-brainstorm
---

## Goal Capsule

**Objective:** Add two AWS Bedrock LLM service variants to J-Buddy — one for the `/openai/v1/responses` endpoint (different API shape, adapter required) and one for the `/openai/v1/chat/completions` endpoint (same shape as existing providers) — both production-ready with streaming support, logging, and telemetry.

**Means:** New `BedrockPayloadAdapter` for Bedrock responses format translation, new `BedrockResponsesService` and `BedrockChatService` classes, config schema update, LLM_CHAIN extension to `["bedrock-response", "bedrock-chat", "gemini", "zai"]`, and `createLlmService` updates.

**Stop when:** TypeScript compiles, all new tests pass, existing tests unchanged.

---

## Product Contract

### Problem Frame

J-Buddy currently uses three LLM providers (gemini, zai) via the OpenAI-compatible `/chat/completions` endpoint. AWS Bedrock offers two different OpenAI-compatible endpoints: `/openai/v1/responses` (newer, different API shape) and `/openai/v1/chat/completions` (same shape as existing providers). The gemma model via Bedrock mantle requires the responses endpoint. Both endpoints should be supported with fallback between them, and both should fall back to gemini/zai if Bedrock fails.

### Requirements

**Bedrock Payload Adapter**
- R1. Create `BedrockPayloadAdapter` (utility object) that translates between J-Buddy's `LlmRequest` shape and Bedrock `/openai/v1/responses` format.
- R2. `adapter.toBedrockRequest(systemPrompt, content) → Bedrock request body` — maps system prompt to `instructions`, user content to `input: [{type: "input_text", text}]`.
- R3. `adapter.toLlmResponse(body) → J-Buddy SuccessResponse` — maps Bedrock `output` array to `choices[0].message.content`, extracts text from content blocks, maps `usage.input_tokens` → `prompt_tokens`, `usage.output_tokens` → `completion_tokens`.
- R4. `adapter.toLlmResponseError(body)` → HttpsError — maps Bedrock error responses to appropriate HttpsError codes.

**Bedrock Responses Service**
- R5. Create `BedrockResponsesService` implementing `LlmService`, using the `BedrockPayloadAdapter` for request/response translation.
- R6. Endpoint: `<api_url>/openai/v1/responses`.
- R7. Config: `{ api_url, api_key, model }` under `config.bedrock.responses`.
- R8. Streaming: parse Bedrock responses SSE format (event type `content_block_delta` with `delta.type`/`delta.text`, `delta.stop_reason`) and forward as standard SSE chunks through the `Response` object.

**Bedrock Chat Service**
- R9. Create `BedrockChatService` implementing `LlmService`, using the standard OpenAI `/chat/completions` payload format (same as GeminiLlmService/ZaiLlmService).
- R10. Endpoint: `<api_url>/openai/v1/chat/completions`.
- R11. Config: `{ api_url, api_key, model }` under `config.bedrock.chat`.
- R12. Streaming: same `fetch → Response` pattern as GeminiLlmService (standard SSE).

**Config & Chain**
- R13. Config schema: add `bedrock` object to `AppConfig` with `responses` and `chat` sub-objects.
- R14. LLM_CHAIN becomes `["bedrock-response", "bedrock-chat", "gemini", "zai"]`.
- R15. Provider model is configurable per environment via the config JSON (no hardcoded model in service classes).

**Factory Integration**
- R16. `createLlmService("bedrock-response")` → `BedrockResponsesService`.
- R17. `createLlmService("bedrock-chat")` → `BedrockChatService`.
- R18. `createLlmService()` (no arg) → `LlmServiceChain` (unchanged behavior).

**Observability & Errors**
- R19. Both services log provider name and model before each call.
- R20. Error mapping: Bedrock HTTP errors are mapped to appropriate `HttpsError` codes (400 → "invalid-argument", 401/403 → "unauthenticated", 429 → "resource-exhausted", 5xx → "internal").
- R21. Usage telemetry maps Bedrock `input_tokens`/`output_tokens` to J-Buddy's `prompt_tokens`/`completion_tokens`.

### Scope Boundaries

- Out of scope: Tool/function calling support in Bedrock responses (the gemma model on Bedrock may support tools, but J-Buddy's current analysis prompt does not use tools).
- Out of scope: Bedrock IAM credential support. The service uses API key auth only (same as existing providers). IAM auth can be added later as a separate concern.
- Out of scope: Modifying existing `GeminiLlmService` or `ZaiLlmService` behavior. They remain unchanged.

### Key Decisions

- **Two Bedrock variants, not one** — Separate services for responses vs chat/completions endpoints, each with its own adapter/payload shape. `(session-settled: user-directed — chosen over single provider: both endpoints needed, different API shapes require different implementations)`
- **Adapter for responses, direct for chat** — `BedrockPayloadAdapter` handles the format translation for the responses endpoint; the chat service uses the standard OpenAI payload directly (no adapter needed). `(session-settled: user-directed — chosen over generic adapter: keeps chat service clean, adapter only where needed)`
- **Chain order: bedrock → bedrock → gemini → zai** — Bedrock variants tried first (lower cost), then gemini, then zai. `(session-settled: user-directed — chosen over gemini-first: bedrock typically lower cost)`
- **Config schema: `bedrock.responses` + `bedrock.chat`** — Both variants share `api_url` and `api_key` but have independent `model` settings. `(session-settled: user-directed — chosen over separate top-level keys: logical grouping, shared credentials)`

### Success Criteria

- TypeScript compiles without errors
- All new unit tests pass
- All existing tests continue to pass
- `LLM_CHAIN` includes both Bedrock variants in correct order
- Streaming support works for both Bedrock variants

---

## Planning Contract

### Key Technical Decisions

- **Two Bedrock variants, not one** - Separate services for responses vs chat/completions endpoints, each with its own adapter/payload shape. Rationale: Different API shapes require different implementations; the gemma model on Bedrock requires the responses endpoint while other providers use chat/completions. `(session-settled: user-directed — chosen over single provider: both endpoints needed, different API shapes require different implementations)`
- **Adapter for responses, direct for chat** - `BedrockPayloadAdapter` handles the format translation for the responses endpoint; the chat service uses the standard OpenAI payload directly (no adapter needed). Rationale: Keeps chat service clean and minimal; adapter only where needed.
- **Chain order: bedrock → bedrock → gemini → zai** - Bedrock variants tried first (lower cost), then gemini, then zai. Rationale: Cost optimization based on typical pricing tiers. `(session-settled: user-directed — chosen over gemini-first: bedrock typically lower cost)`
- **Config schema: `bedrock.responses` + `bedrock.chat`** - Both variants share `api_url` and `api_key` but have independent `model` settings. Rationale: Logical grouping, shared credentials, independent model selection.
- **No tool calling support** - Out of scope because current analysis prompt doesn't use tools. Can be added later as a separate concern.
- **API key auth only** - IAM auth not implemented. Can be added later as a separate concern.

### Approach

The implementation follows the existing LLM service abstraction pattern:

1. **Create `BedrockPayloadAdapter`** - Utility class that translates between J-Buddy's `LlmRequest` shape and Bedrock `/openai/v1/responses` format. Maps system prompt to `instructions`, user content to `input: [{type: "input_text", text}]`, and converts Bedrock response content blocks to J-Buddy's `choices[0].message.content`.

2. **Create `BedrockResponsesService`** - Implements `LlmService` interface, uses `BedrockPayloadAdapter`, calls `/openai/v1/responses` endpoint. Streaming parses Bedrock SSE format (event type `content_block_delta` with `delta.type`/`delta.text`, `delta.stop_reason`) and forwards as standard SSE chunks.

3. **Create `BedrockChatService`** - Implements `LlmService` interface, uses standard OpenAI `/chat/completions` payload format (same as `GeminiLlmService`/`ZaiLlmService`). Streaming follows the same `fetch → Response` pattern as existing services.

4. **Update `createLlmService` factory** - Add cases for `"bedrock-response"` and `"bedrock-chat"` providers. Update `LLM_CHAIN` to include both Bedrock variants first.

5. **Update config schema** - Add `bedrock` object to `AppConfig` with `responses` and `chat` sub-objects, each with `api_url`, `api_key`, `model` fields.

### Assumptions

- Bedrock API key authentication works the same way as Gemini/ZAI (Bearer token in Authorization header)
- Bedrock responses SSE format follows standard SSE conventions (event type `data` with JSON payload)
- Bedrock error responses follow standard HTTP error patterns with JSON body
- No rate limiting or quota management beyond what exists in the retry chain
- The gemma model via Bedrock uses the responses endpoint; other models use chat/completions

### Open Questions

- None — all technical decisions were settled during requirements definition.

---

## Implementation Units

### U1: Create BedrockPayloadAdapter

**Files:** `japanese-alchemy-hosting/functions/src/services/bedrockPayloadAdapter.ts`

**Dependencies:** None

**Implementation:**
- Implement `toBedrockRequest(systemPrompt: string, content: string)` - maps system prompt to `instructions`, user content to `input: [{type: "input_text", text}]`
- Implement `toLlmResponse(body: BedrockResponse) → SuccessResponse` - extracts text from content blocks, maps usage
- Implement `toLlmResponseError(body: BedrockErrorResponse) → HttpsError` - maps HTTP errors to appropriate codes

**Test scenarios:**
- Maps system prompt to `instructions` field correctly
- Maps user content to `input: [{type: "input_text", text}]` format
- Extracts text from Bedrock content blocks array
- Maps `usage.input_tokens` → `prompt_tokens`, `usage.output_tokens` → `completion_tokens`
- Maps 400 → "invalid-argument", 401/403 → "unauthenticated", 429 → "resource-exhausted", 5xx → "internal"

**Verification:** Unit tests in `test/services/bedrockPayloadAdapter.test.ts` pass

---

### U2: Create BedrockResponsesService

**Files:** `japanese-alchemy-hosting/functions/src/services/bedrockResponsesService.ts`

**Dependencies:** U1 (BedrockPayloadAdapter)

**Implementation:**
- Implements `LlmService` interface with `chatCompletion()` and `streamCompletion()` methods
- Uses `BedrockPayloadAdapter` for request/response translation
- Calls `<api_url>/openai/v1/responses` endpoint
- Streaming parses Bedrock SSE format (event type `content_block_delta` with `delta.type`/`delta.text`, `delta.stop_reason`)
- Logs provider name and model before each call
- Error mapping: Bedrock HTTP errors mapped to appropriate `HttpsError` codes

**Test scenarios:**
- Happy path: `chatCompletion()` returns valid `SuccessResponse` with usage
- Happy path: `streamCompletion()` returns valid `Response` object
- Edge case: Empty content blocks array handled gracefully
- Error path: 429 triggers retry in chain
- Error path: 400/401/403 propagate immediately (non-retryable)

**Verification:** Unit tests in `test/services/bedrockResponsesService.test.ts` pass

---

### U3: Create BedrockChatService

**Files:** `japanese-alchemy-hosting/functions/src/services/bedrockChatService.ts`

**Dependencies:** None (uses standard OpenAI payload format)

**Implementation:**
- Implements `LlmService` interface with `chatCompletion()` and `streamCompletion()` methods
- Uses standard OpenAI `/chat/completions` payload format (same as `GeminiLlmService`/`ZaiLlmService`)
- Calls `<api_url>/openai/v1/chat/completions` endpoint
- Streaming follows same pattern as `GeminiLlmService` (standard SSE)
- Logs provider name and model before each call
- Error mapping: Bedrock HTTP errors mapped to appropriate `HttpsError` codes

**Test scenarios:**
- Happy path: `chatCompletion()` returns valid `SuccessResponse` with usage
- Happy path: `streamCompletion()` returns valid `Response` object
- Edge case: Empty choices array handled gracefully
- Error path: 429 triggers retry in chain
- Error path: 400/401/403 propagate immediately (non-retryable)

**Verification:** Unit tests in `test/services/bedrockChatService.test.ts` pass

---

### U4: Update createLlmService factory

**Files:** `japanese-alchemy-hosting/functions/src/services/llmService.ts`

**Dependencies:** U2, U3 (BedrockResponsesService, BedrockChatService)

**Implementation:**
- Add `import { BedrockResponsesService } from "./bedrockResponsesService";`
- Add `import { BedrockChatService } from "./bedrockChatService";`
- Update `createLlmService()` switch to handle `"bedrock-response"` and `"bedrock-chat"`

**Test scenarios:**
- `createLlmService("bedrock-response")` returns `BedrockResponsesService` instance
- `createLlmService("bedrock-chat")` returns `BedrockChatService` instance
- `createLlmService()` (no arg) returns `LlmServiceChain` unchanged

**Verification:** Existing unit tests in `test/services/llmService.test.ts` pass

---

### U5: Update config schema and LLM_CHAIN

**Files:** `japanese-alchemy-hosting/functions/src/config.ts`

**Dependencies:** None (config-only change)

**Implementation:**
- Add `bedrock` interface to `AppConfig` with `responses` and `chat` sub-objects
- Update `LLM_CHAIN` to `["bedrock-response", "bedrock-chat", "gemini", "zai"]`
- Update `LLM_PROVIDER` documentation to include new valid values

**Test scenarios:**
- TypeScript compiles without errors
- Config validation accepts `bedrock.responses` and `bedrock.chat` structure
- `LLM_CHAIN` contains all four providers in correct order

**Verification:** TypeScript compilation succeeds, existing unit tests pass

---

## Verification Contract

**Build:** `cd japanese-alchemy-hosting/functions && npm run build`
**Tests:** `cd japanese-alchemy-hosting/functions && npm test`
**Lint:** `cd japanese-alchemy-hosting/functions && npm run lint`

**Test files to create:**
- `japanese-alchemy-hosting/functions/test/services/bedrockPayloadAdapter.test.ts`
- `japanese-alchemy-hosting/functions/test/services/bedrockResponsesService.test.ts`
- `japanese-alchemy-hosting/functions/test/services/bedrockChatService.test.ts`

**Test expectations:**
- U1: PayloadAdapter tests cover all mapping scenarios (R1-R4)
- U2: BedrockResponsesService tests cover streaming and batch (R5-R8)
- U3: BedrockChatService tests cover streaming and batch (R9-R12)
- U4: Factory tests verify new providers (R16-R18)
- U5: Config tests verify chain order (R14-R15)

---

## Definition of Done

- [ ] All new unit tests pass
- [ ] Existing tests unchanged (all pass)
- [ ] TypeScript compiles without errors
- [ ] ESLint passes without new errors
- [ ] `LLM_CHAIN` includes both Bedrock variants in correct order
- [ ] Config schema accepts `bedrock.responses` and `bedrock.chat` configuration
- [ ] `createLlmService()` factory returns correct service for each provider
- [ ] Streaming support works for both Bedrock variants
- [ ] Error mapping returns appropriate `HttpsError` codes
- [ ] Observability logging includes provider name and model

---

## Appendix

### Existing Patterns to Follow

**GeminiLlmService** (`japanese-alchemy-hosting/functions/src/services/geminiLlmService.ts`)
- Standard OpenAI-compatible `/chat/completions` implementation
- Streaming with SSE parsing
- Error handling and logging patterns

**ZaiLlmService** (`japanese-alchemy-hosting/functions/src/services/zaiLlmService.ts`)
- Standard OpenAI-compatible `/chat/completions` implementation
- Streaming with SSE parsing
- Error handling and logging patterns

**LlmRetryService** (`japanese-alchemy-hosting/functions/src/services/llmRetryService.ts`)
- Retry chain implementation
- `shouldRetry()` function for retryable error classification
- Sequential provider fallback logic

### Bedrock API References

**Bedrock `/openai/v1/responses` endpoint:**
- Request format: `instructions` array + `input` array with `type: "input_text"`
- Response format: `output` array with `type: "content_block"` containing `text` field
- Streaming format: SSE with `content_block_delta` event type

**Bedrock `/openai/v1/chat/completions` endpoint:**
- Same payload format as existing providers (messages, model, temperature, max_tokens, stream)
- Standard OpenAI-compatible response format
- Streaming follows standard SSE pattern

### Out of Scope (per requirements)

- Tool/function calling support in Bedrock responses
- Bedrock IAM credential support (API key only)
- Modifying existing `GeminiLlmService` or `ZaiLlmService` behavior

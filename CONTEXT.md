# J-Buddy

The shared language for J-Buddy's Japanese-text analysis experience and its learner-configured providers.

## Provider Configuration

**Personal-provider protocol**:
The API contract a personal provider profile uses for analysis requests. J-Buddy supports Chat Completions-compatible and Responses-compatible protocols.
_Avoid_: endpoint type, API mode

**Responses-compatible provider**:
A personal provider that accepts the OpenAI Responses API request and event contract at its Responses endpoint. It is distinct from a Chat Completions-compatible provider.
_Avoid_: Responses API, OpenAI provider

**Manual model ID**:
A learner-supplied model identifier for a personal provider whose model catalog cannot be discovered. It is the fallback to selecting a model from the provider's model catalog.
_Avoid_: free-text model, custom model name

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

**Cached model catalog**:
The last successfully discovered model catalog retained for a saved personal provider profile. It remains valid only while that profile's protocol, normalized API URL, and credential identity are unchanged.
_Avoid_: model list, remembered models

**Saved model selection**:
The model identifier already persisted in a personal provider profile. It remains visible as the learner's configured choice even when it is absent from, or cannot yet be checked against, the current model catalog.
_Avoid_: default model, cached model

**Model source**:
Whether a saved model selection came from model-catalog discovery or, for an eligible Responses-compatible provider, manual model ID entry.
_Avoid_: model type, selection mode

## Usage Controls

**Daily analysis allowance**:
The sole application-level admission control for managed-provider analysis: the maximum number of requests admitted for one daily usage subject during a single daily accounting period. For this effort, the intended allowance is 20 requests.
_Avoid_: rate limit, quota (when referring to infrastructure concurrency controls)

**Daily usage subject**:
An independently counted identity for the daily analysis allowance. A signed-in analysis has both a user subject and an IP subject; a signed-out analysis has only an IP subject.
_Avoid_: account, client

**Verified user subject**:
The daily usage subject derived only from a Firebase-verified user identity, never from caller-supplied request data.
_Avoid_: user ID parameter, account ID

**Pseudonymous IP subject**:
The daily usage subject derived from a client IP with a versioned, secret HMAC. It contains no raw IP address and supports a short overlap while the HMAC key is rotated.
_Avoid_: IP address, IP hash

**Allowance admission**:
The atomic decision to allow a managed-provider analysis only when every applicable daily usage subject has remaining allowance. An admitted analysis consumes one allowance from each applicable subject.
_Avoid_: request count, rate-limit check

**Unattributable anonymous request**:
A signed-out managed-provider analysis request for which the service cannot establish a client IP subject. It is not admitted for model work.
_Avoid_: missing-IP request, anonymous fallback

**Infrastructure concurrency ceiling**:
The deployment-level maximum number of managed-provider analyses that may execute at once. It protects service capacity without changing a learner's daily analysis allowance.
_Avoid_: burst limit, rate limit

**Allowance decision event**:
A structured operational record of an allowance admission outcome. It identifies the outcome, endpoint, and subject type without carrying raw IP addresses, user identifiers, or learner content.
_Avoid_: request log, usage record

**Effective remaining allowance**:
The least remaining daily analysis allowance among all subjects applicable to a request. It is the only remaining-allowance value shown to a learner, so the service does not disclose which subject is limiting them.
_Avoid_: user quota, IP quota

**Allowance exhaustion**:
The expected state in which no applicable daily usage subject can admit another managed-provider analysis before the next reset. It is distinct from an unavailable enforcement service.
_Avoid_: API error, temporary outage

**Allowance status**:
The non-persistent learner-facing display of effective remaining allowance and reset time, sourced from a server response for the current sidepanel session.
_Avoid_: cached quota, usage history

**Managed-provider exhausted state**:
The sidepanel state that suppresses further managed-provider analysis attempts until the server-provided reset time, while retaining the learner's personal-provider option.
_Avoid_: disabled analysis, global lockout

**Allowance enforcement outage**:
A temporary inability to evaluate allowance admission. It does not change allowance status or enter the managed-provider exhausted state.
_Avoid_: exhausted allowance, rate-limit error

**Admitted analysis failure**:
An analysis that fails after allowance admission, such as a model or stream failure. The admission remains consumed and its current allowance status is shown to the learner.
_Avoid_: refunded request, quota error

**Allowance rollout**:
The staged release of daily allowance support: deploy server support disabled, publish compatible learner UI, then enable enforcement after the adoption window and prerequisite check.
_Avoid_: feature launch, code deployment

**Allowance rollback**:
Disabling daily enforcement through its server-owned setting while preserving the compatible callable contract and retained counters for diagnosis.
_Avoid_: redeploy, data cleanup

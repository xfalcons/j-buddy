import { marked } from 'marked';
import createDOMPurify from 'dompurify';
import authService from '../scripts/authService.js';
import {
    getPromptVariant,
    setPromptVariant,
} from '../scripts/promptVariant.js';
import {
    MANAGED_PROVIDER_MODE,
    PERSONAL_PROVIDER_MODE,
    clearPersonalProvider,
    getPersonalProviderState,
    requestPersonalProviderOriginPermission,
    savePersonalProvider,
    setAnalysisProviderMode,
} from '../scripts/personalProvider.js';
import { DirectLlmApiService } from '../scripts/directLlmApiService.js';
import { buildContextCacheKey } from '../scripts/surroundingContext.js';
import { enrichMarkdownWithConjugation } from '../scripts/conjugation.js';

// Configure marked.js to preserve ruby tags and add classes
marked.setOptions({
  gfm: true,
  breaks: true,
  xhtml: true,
  headerIds: false,
});

const ANALYSIS_ALLOWED_TAGS = [
    'a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4',
    'h5', 'h6', 'hr', 'li', 'ol', 'p', 'pre', 'ruby', 'rb', 'rt', 'strong',
    'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul',
];
const ANALYSIS_ALLOWED_ATTR = ['colspan', 'href', 'rowspan', 'title'];
const COMPLETED_ANALYSIS_RESULT_CACHE_VERSION = 1;
const COMPLETED_ANALYSIS_RESULT_STORAGE_KEY = 'lastAnalysisResult';
const CONTROLLED_CHECKBOX_PATTERN = /<input type="checkbox" name="(words|grammars)" value="([^"<>]*)">/g;

function getDomPurify() {
    // The production side panel always has a real browser window. The guarded
    // fallback keeps the pure Node test environment deterministic without
    // weakening the browser rendering path.
    if (typeof createDOMPurify?.sanitize === 'function') return createDOMPurify;
    if (globalThis.window?.document?.createElement) return createDOMPurify(globalThis.window);
    return null;
}

function fallbackSanitizeHtml(html) {
    return String(html || '')
        .replace(/<\/?(?:script|style|iframe|object|embed|form|input|button|svg|math)[^>]*>/gi, '')
        .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\s(?:href|src)\s*=\s*(?:"\s*(?:javascript|data):[^"]*"|'\s*(?:javascript|data):[^']*'|\s*(?:javascript|data):[^\s>]*)/gi, '');
}

/**
 * Sanitize the final HTML immediately before it enters the side panel DOM.
 * In particular, raw provider `<input>`/`<form>` markup cannot forge save
 * controls; controlled checkboxes are appended only afterwards.
 */
export function sanitizeAnalysisHtml(html) {
    const purifier = getDomPurify();
    if (!purifier) return fallbackSanitizeHtml(html);
    return purifier.sanitize(html, {
        ALLOWED_TAGS: ANALYSIS_ALLOWED_TAGS,
        ALLOWED_ATTR: ANALYSIS_ALLOWED_ATTR,
        ALLOW_DATA_ATTR: false,
    });
}

function sanitizeCachedAnalysisHtml(html) {
    const checkboxes = [];
    const withCheckboxPlaceholders = String(html || '').replace(
        CONTROLLED_CHECKBOX_PATTERN,
        (checkbox) => {
            const placeholder = `ANALYSIS_CACHE_CHECKBOX_${checkboxes.length}_`;
            checkboxes.push({ placeholder, checkbox });
            return placeholder;
        }
    );
    let sanitizedHtml = sanitizeAnalysisHtml(withCheckboxPlaceholders);
    checkboxes.forEach(({ placeholder, checkbox }) => {
        sanitizedHtml = sanitizedHtml.replace(placeholder, checkbox);
    });
    return sanitizedHtml;
}

/**
 * Stored vocabulary and grammar fields are later rendered by the web app.
 * They are markdown, not HTML, so discard all provider-supplied HTML before
 * the fields leave the extension. Ruby is represented in this stored format
 * as `{word|reading}`, so this does not remove J-Buddy's annotation syntax.
 */
export function sanitizeAnalysisTextForStorage(value) {
    const text = String(value || '');
    const purifier = getDomPurify();
    if (purifier) {
        return purifier.sanitize(text, {
            ALLOWED_TAGS: [],
            ALLOWED_ATTR: [],
            ALLOW_DATA_ATTR: false,
        });
    }

    // The test-only fallback deliberately keeps markdown text while dropping
    // raw HTML tags. The production extension takes the DOMPurify path above.
    return text
        .replace(/<!--([\s\S]*?)-->/g, '')
        .replace(/<\/?[^>]+>/g, '');
}

function escapeHtmlAttribute(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function renderAnalysisMarkdown(markdown, { includeCheckboxes = false } = {}) {
    const rubyConverted = convertToRuby(markdown);
    let html = sanitizeAnalysisHtml(marked.parse(rubyConverted));
    if (!includeCheckboxes) return html;

    // Only the prescribed analysis headings generate save controls. A raw
    // provider-supplied input was removed above and a generic h4 cannot create
    // a checkbox by itself.
    return html.replace(/<h4>([\s\S]*?)<\/h4>/g, (match, headingText) => {
        let typename = null;
        if (headingText.includes('&lt;文法&gt;')) {
            headingText = headingText.replace('&lt;文法&gt;', '').trim();
            typename = 'grammars';
        } else if (headingText.includes('&lt;單字&gt;')) {
            headingText = headingText.replace('&lt;單字&gt;', '').trim();
            typename = 'words';
        }
        if (!typename) return `<h4>${headingText}</h4>`;
        const convertedHeading = escapeHtmlAttribute(convertFromRuby(headingText));
        return `<h4><input type="checkbox" name="${typename}" value="${convertedHeading}">${headingText}</h4>`;
    });
}

// Function to convert Japanese text with readings in square brackets to HTML with ruby tags
export function convertToRuby(text) {
    if (!text) return '';

    // Handle the format: {漢字|かんじ} to <ruby><rb>漢字</rb><rt>かんじ</rt></ruby>
    return text.replace(/{(.+?)\|(.+?)}/g, (match, kanji, reading) => {
        // Trim any whitespace from kanji and reading
        kanji = kanji.trim();
        reading = reading.trim();
        return `<ruby><rb>${kanji}</rb><rt>${reading}</rt></ruby>`;
    });
}

// Function to convert Ruby tags back to markdown format
export function convertFromRuby(html) {
    if (!html) return '';

    // Handle the format: <ruby><rb>漢字</rb><rt>かんじ</rt></ruby> to {漢字|かんじ}
    return html.replace(/<ruby>\s*<rb>(.+?)<\/rb>\s*<rt>(.+?)<\/rt>\s*<\/ruby>/g, (match, kanji, reading) => {
        // Trim any whitespace from kanji and reading
        kanji = kanji.trim();
        reading = reading.trim();
        return `{${kanji}|${reading}}`;
    });
}

// Function to format the analysis result using marked.js
export function formatAnalysisResult(markdown) {
    // Handle null/undefined input
    const resultData = {
        "json": { "words": [], "grammars": [] },
        "html": ""
    };
    if (!markdown) return resultData;

    // 2. 切割區塊：以 "#### " 作為分割點
    const sections = markdown.split(/(?=^### )/gm);
    const jsonData = {};

    const wordSection = sections.find(section => section.trim().startsWith('### 單字分析'));
    const grammarSection = sections.find(section => section.trim().startsWith('### 文法分析'));

    // Remove the "### 單字分析" heading
    if (wordSection) {
        const wordContent = wordSection.replace(/^### 單字分析*/m, '').trim();
        // Extract 'term' from "####" headings, leave the rest as 'detail'
        wordContent.split(/^####\s+/gm).forEach(entry => {
            const lines = entry.trim().split('\n');
            // remove <單字>： prefix if exists
            const term = sanitizeAnalysisTextForStorage(
                lines.shift().trim().replace('<單字>', '')
            ); // First line is the term
            const detail = sanitizeAnalysisTextForStorage(lines.join('\n').trim()); // The rest is detail
            // push into jsonData.words
            if (term) {
                if (!jsonData.words) jsonData.words = [];
                jsonData.words.push({ "term": term, "detail": detail });
            }
        });
    }

    if (grammarSection) {
        const grammarContent = grammarSection.replace(/^### 文法分析*/m, '').trim();
        // Extract 'point' from "####" headings, leave the rest as 'explanation'
        grammarContent.split(/^####\s+/gm).forEach(entry => {
            const lines = entry.trim().split('\n');
            // remove <文法>： prefix if exists
            const point = sanitizeAnalysisTextForStorage(
                lines.shift().trim().replace('<文法>', '')
            ); // First line is the point
            const explanation = sanitizeAnalysisTextForStorage(lines.join('\n').trim()); // The rest is explanation
            // push into jsonData.grammars
            if (point) {
                if (!jsonData.grammars) jsonData.grammars = [];
                jsonData.grammars.push({ "point": point, "explanation": explanation });
            }
        });
    }

    // console.log('jsonData after word section:', jsonData);
    resultData.json = jsonData;

    resultData.html = renderAnalysisMarkdown(markdown, { includeCheckboxes: true });
    // console.log('Formatted HTML:', resultData.html);

    return resultData;
}

function isStructuredAnalysisEntry(entry, fields) {
    return entry
        && typeof entry === 'object'
        && fields.every((field) => typeof entry[field] === 'string');
}

function isStructuredAnalysisResult(json) {
    return json
        && typeof json === 'object'
        && Array.isArray(json.words)
        && Array.isArray(json.grammars)
        && json.words.every((word) => isStructuredAnalysisEntry(word, ['term', 'detail']))
        && json.grammars.every((grammar) => isStructuredAnalysisEntry(grammar, ['point', 'explanation']));
}

function createCompletedAnalysisProjection(cacheKey, analysisResult) {
    return JSON.stringify({
        version: COMPLETED_ANALYSIS_RESULT_CACHE_VERSION,
        cacheKey,
        html: analysisResult.html,
        json: analysisResult.json,
    });
}

function getCachedCompletedAnalysis(cacheKey) {
    const storedProjection = localStorage.getItem(COMPLETED_ANALYSIS_RESULT_STORAGE_KEY);
    if (!storedProjection) return null;

    try {
        const projection = JSON.parse(storedProjection);
        if (projection?.version !== COMPLETED_ANALYSIS_RESULT_CACHE_VERSION
            || projection.cacheKey !== cacheKey
            || typeof projection.html !== 'string'
            || !projection.html.trim()
            || !isStructuredAnalysisResult(projection.json)) {
            return null;
        }

        const sanitizedHtml = sanitizeCachedAnalysisHtml(projection.html);
        // A projection changed by sanitization is treated as untrusted. Its
        // matching canonical markdown, if present, is reformatted instead.
        if (!sanitizedHtml || sanitizedHtml !== projection.html) return null;

        return { html: sanitizedHtml, json: projection.json };
    } catch {
        return null;
    }
}

function renderCompletedAnalysis(analysisResult, proseElement, resultElement, loadingElement) {
    saveForLaterJson = analysisResult.json;
    proseElement.innerHTML = sanitizeCachedAnalysisHtml(analysisResult.html);
    resultElement.classList.add('show');
    setLoadingState(loadingElement, false);
    setCompletedAnalysisAvailable(true);
}

function restoreCompletedAnalysis(cacheKey, proseElement, resultElement, loadingElement) {
    if (cacheKey !== localStorage.getItem('lastAnalysisKey')) return false;

    const cachedProjection = getCachedCompletedAnalysis(cacheKey);
    if (cachedProjection) {
        renderCompletedAnalysis(cachedProjection, proseElement, resultElement, loadingElement);
        return true;
    }

    const storedResponse = localStorage.getItem('lastResponse');
    if (!storedResponse) return false;

    const analysisResult = formatAnalysisResult(storedResponse);
    if (!analysisResult.html) return false;

    localStorage.setItem(
        COMPLETED_ANALYSIS_RESULT_STORAGE_KEY,
        createCompletedAnalysisProjection(cacheKey, analysisResult)
    );
    renderCompletedAnalysis(analysisResult, proseElement, resultElement, loadingElement);
    return true;
}

// Function to show error message
function alertMessage(element, message, type = 'error') {
    if (!element) return;
    // Error strings originate from Firebase or a learner-configured provider.
    // Render them as text so a remote error cannot execute markup in the panel.
    element.textContent = String(message || '');
}

// Function to show loading state
function setLoadingState(loadingElement, show) {
    if (show) {
        loadingElement.classList.add('show');
    } else {
        loadingElement.classList.remove('show');
    }
}

function setLoadingMessage(loadingElement, message) {
    const messageElement = loadingElement.querySelector
        ? loadingElement.querySelector('.loading-message')
        : null;
    if (messageElement) {
        messageElement.textContent = message;
    }
}

// Retrieve and display selected text
async function loadSelectedText() {
  const { selectedText, contextBefore = '', contextAfter = '' } =
    await chrome.storage.local.get(['selectedText', 'contextBefore', 'contextAfter']);
  // return selectedText;
  await analizingSelectedText(selectedText, { before: contextBefore, after: contextAfter });
}

// Update when new selections arrive
chrome.storage.onChanged.addListener(async (changes) => {
    console.log('Storage changes...');
  if (changes.personalProviderProfile || changes.analysisProviderMode || changes.personalProviderRevision) {
    // A profile, permission route, or revision changed while a request was in
    // flight. Invalidate its callbacks before it can overwrite the panel or
    // cache a response under the wrong provider identity.
    cancelActiveAnalysis();
    analysisRequestId += 1;
    isAnalizing = false;
    activeAnalysisKey = null;
    setCompletedAnalysisAvailable(false);
  }
  if (changes.selectedText || changes.contextBefore || changes.contextAfter) {
    cancelActiveAnalysis();
    const { selectedText, contextBefore = '', contextAfter = '' } =
      await chrome.storage.local.get(['selectedText', 'contextBefore', 'contextAfter']);
    await analizingSelectedText(selectedText, { before: contextBefore, after: contextAfter });
  }
});

// Handle messages from background scripts
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === 'textSelectedChanged') {
      await analizingSelectedText(request.data, {
        before: request.contextBefore || '',
        after: request.contextAfter || '',
      });
    }
    sendResponse({ status: 'success' });
});

let isAnalizing = false;
let saveForLaterJson = {};
let renderThrottleTimer = null;
let currentSelectedText = '';
let currentContext = { before: '', after: '' };
let analysisRequestId = 0;
let activeAnalysisKey = null;
let activeAnalysisController = null;
let activeAnalysisRequestIdentity = null;
let modeChangeRequestId = 0;
let hasCompletedAnalysis = false;

function normalizeContext(context = {}) {
    return {
        before: context.before || '',
        after: context.after || '',
    };
}

function isValidSelection(selectedText) {
    return !!selectedText && selectedText.length >= 2 && selectedText.length <= 500;
}

function isLatestAnalysis(requestId) {
    return requestId === analysisRequestId;
}

function cancelActiveAnalysis() {
    activeAnalysisController?.abort();
    activeAnalysisController = null;
    activeAnalysisRequestIdentity = null;
}

function analysisSourceIdentity(providerState) {
    return providerState?.mode === PERSONAL_PROVIDER_MODE
        ? `${PERSONAL_PROVIDER_MODE}:${providerState.revision || 0}`
        : `${MANAGED_PROVIDER_MODE}:0`;
}

function setCompletedAnalysisAvailable(available) {
    hasCompletedAnalysis = available;
    [elements?.copyButton, elements?.saveAsBtn, elements?.saveForLaterBtn]
        .filter(Boolean)
        .forEach((button) => { button.disabled = !available; });
}

function isLatestModeChange(requestId) {
    return requestId === modeChangeRequestId;
}

// Throttled progressive render: re-parses accumulated markdown at most every 80ms
function renderStreamingPreview(proseElement, accumulatedText, requestId) {
    if (renderThrottleTimer) return; // already scheduled
    renderThrottleTimer = setTimeout(() => {
        renderThrottleTimer = null;
        if (!isLatestAnalysis(requestId)) return;
        proseElement.innerHTML = renderAnalysisMarkdown(accumulatedText);
    }, 80);
}

export async function analizingSelectedText(selectedText, context = { before: '', after: '' }, options = {}) {
    const selectedTextForRequest = selectedText || '';
    const contextForRequest = normalizeContext(context);
    const requestIdentity = JSON.stringify({ selectedText: selectedTextForRequest, context: contextForRequest });
    if (!options.force && activeAnalysisRequestIdentity === requestIdentity) {
        return;
    }

    // A replacement must invalidate an active stream before any async setup.
    // Otherwise the prior request can finish while prompt/provider state loads.
    const requestId = ++analysisRequestId;
    cancelActiveAnalysis();
    activeAnalysisRequestIdentity = requestIdentity;
    currentSelectedText = selectedTextForRequest;
    currentContext = contextForRequest;

    const resultElement = document.getElementById('result');
    const proseElement = resultElement.querySelector('.prose');
    const loadingElement = document.getElementById('loading');
    let promptVariant;
    let providerState;
    try {
        promptVariant = options.promptVariant || await getPromptVariant();
        if (!isLatestAnalysis(requestId)) return;
        providerState = await getPersonalProviderState();
    } catch (error) {
        if (isLatestAnalysis(requestId)) {
            activeAnalysisRequestIdentity = null;
            isAnalizing = false;
            activeAnalysisKey = null;
            saveForLaterJson = {};
            proseElement.innerHTML = '';
            resultElement.classList.remove('show');
            setLoadingState(loadingElement, false);
            setCompletedAnalysisAvailable(false);
            console.error('Analysis setup error:', error);
            alertMessage(elements.alertMessage, '無法讀取此頁面上的選取文字。', 'error');
            elements.alertMessage.classList.add('show');
        }
        return;
    }
    if (!isLatestAnalysis(requestId)) return;
    const sourceIdentity = analysisSourceIdentity(providerState);
    const cacheKey = selectedTextForRequest
        ? buildContextCacheKey({
            selectedText: selectedTextForRequest,
            context: contextForRequest,
            promptVariant,
            sourceIdentity,
        })
        : '';

    // Permission can be revoked without changing the saved profile or cache
    // key. Check readiness before any cache reuse so a stale personal result
    // never becomes visible, copyable, or saveable after revocation.
    if (isValidSelection(selectedTextForRequest)
        && providerState.mode === PERSONAL_PROVIDER_MODE
        && !providerState.isPersonalReady) {
        isAnalizing = false;
        activeAnalysisKey = null;
        activeAnalysisRequestIdentity = null;
        saveForLaterJson = {};
        proseElement.innerHTML = '';
        resultElement.classList.remove('show');
        setLoadingState(loadingElement, false);
        setCompletedAnalysisAvailable(false);
        alertMessage(
            elements.alertMessage,
            providerState.personalError?.message
                || '已選取個人分析，但提供者設定無法使用。',
            'error'
        );
        elements.alertMessage.classList.add('show');
        return;
    }

    console.log('Analizing Selected Text...');
    let analysisController = null;
    isAnalizing = true;
    setCompletedAnalysisAvailable(false);
    activeAnalysisKey = cacheKey;
    if (renderThrottleTimer) {
        clearTimeout(renderThrottleTimer);
        renderThrottleTimer = null;
    }

    // Clear previous alertMessage
    elements.alertMessage.classList.remove('show');

    try {
        // Cache hit when the complete analysis identity matches. The projection
        // keeps the interactive render state, while canonical markdown remains
        // the source for Copy and Save As.
        if (isValidSelection(selectedTextForRequest)
            && restoreCompletedAnalysis(cacheKey, proseElement, resultElement, loadingElement)) {
            if (!isLatestAnalysis(requestId)) return;
            console.log('Selected text + context same as last time');
        } else if (isValidSelection(selectedTextForRequest)) {
            // Show loading state
            setLoadingMessage(loadingElement, 'AI 正在分析，請稍候…');
            setLoadingState(loadingElement, true);
            proseElement.innerHTML = '';
            resultElement.classList.remove('show');
            saveForLaterJson = {};

            if (providerState.mode === PERSONAL_PROVIDER_MODE && !providerState.isPersonalReady) {
                const errorMessage = providerState.personalError?.message
                    || '已選取個人分析，但提供者設定無法使用。';
                alertMessage(elements.alertMessage, errorMessage, 'error');
                elements.alertMessage.classList.add('show');
                setLoadingState(loadingElement, false);
                return;
            }

            try {
                console.log('Initializing API service...');
                const analysisService = providerState.mode === PERSONAL_PROVIDER_MODE
                    ? new DirectLlmApiService()
                    : new JaAlchemyApiService();

                console.log('Generating response (streaming)...');
                let firstChunkReceived = false;

                const streamArgs = providerState.mode === PERSONAL_PROVIDER_MODE
                    ? [providerState.profile, selectedTextForRequest, promptVariant, contextForRequest]
                    : [selectedTextForRequest, promptVariant, contextForRequest];
                analysisController = new AbortController();
                activeAnalysisController = analysisController;
                await analysisService.generateResponseStream(
                    ...streamArgs,
                    // onChunk: progressively render each chunk
                    (chunk, fullText) => {
                        if (!isLatestAnalysis(requestId)) return;
                        if (!firstChunkReceived) {
                            firstChunkReceived = true;
                            setLoadingMessage(loadingElement, '已收到分析結果，正在整理版面…');
                            resultElement.classList.add('show');
                        }
                        renderStreamingPreview(proseElement, fullText, requestId);
                    },
                    // onDone: finalize with full formatting (checkboxes, structured data)
                    (fullText) => {
                        if (!isLatestAnalysis(requestId)) return;
                        // Enrich the raw stream with engine-generated verb
                        // conjugation before any consumer reads it, so the
                        // rendered panel, the saved item, Copy, Save-As, and the
                        // cached response all carry the generated table from one
                        // pass (see KTD2).
                        const enrichedText = enrichMarkdownWithConjugation(fullText);
                        const analysisResult = formatAnalysisResult(enrichedText);
                        const completedProjection = createCompletedAnalysisProjection(cacheKey, analysisResult);
                        // Advance the cache only after enrichment and formatting
                        // both succeed, so errors cannot leave a key pointing at
                        // a stale or partial result.
                        localStorage.setItem('lastResponse', enrichedText);
                        localStorage.setItem('lastAnalysisKey', cacheKey);
                        localStorage.setItem('lastSelectedText', selectedTextForRequest);
                        localStorage.setItem(COMPLETED_ANALYSIS_RESULT_STORAGE_KEY, completedProjection);
                        if (renderThrottleTimer) {
                            clearTimeout(renderThrottleTimer);
                            renderThrottleTimer = null;
                        }
                        renderCompletedAnalysis(analysisResult, proseElement, resultElement, loadingElement);
                    },
                    // onError
                    (errorMessage) => {
                        if (!isLatestAnalysis(requestId)) return;
                        console.warn('Streaming API Error:', errorMessage);
                        if (renderThrottleTimer) {
                            clearTimeout(renderThrottleTimer);
                            renderThrottleTimer = null;
                        }
                        alertMessage(elements.alertMessage, `呼叫分析服務時發生錯誤：${errorMessage}`, 'error');
                        elements.alertMessage.classList.add('show');
                        setLoadingState(loadingElement, false);
                        setCompletedAnalysisAvailable(false);
                    },
                    { signal: analysisController.signal }
                );
            } catch (apiError) {
                if (!isLatestAnalysis(requestId)) return;
                console.warn('Calling API Error:', apiError);
                alertMessage(elements.alertMessage, `呼叫分析服務時發生錯誤：${apiError.message}`, 'error');
                elements.alertMessage.classList.add('show');
                setLoadingState(loadingElement, false);
                setCompletedAnalysisAvailable(false);
            }
        } else {
            if (!isLatestAnalysis(requestId)) return;
            alertMessage(elements.alertMessage, '尚未選取文字，或文字長度不符。請在頁面選取 2–500 個字元後重新開啟側邊欄。', 'info');
            elements.alertMessage.classList.add('show');
            elements.result.classList.remove('show');
        }
    } catch (error) {
        if (!isLatestAnalysis(requestId)) return;
        console.error('General Error:', error);
        alertMessage(elements.alertMessage, '無法讀取此頁面上的選取文字。', 'error');
        elements.alertMessage.classList.add('show');
        elements.result.classList.remove('show');
        setLoadingState(loadingElement, false);
    }
    if (isLatestAnalysis(requestId)) {
        if (activeAnalysisController === analysisController) {
            activeAnalysisController = null;
        }
        isAnalizing = false;
        activeAnalysisKey = null;
        activeAnalysisRequestIdentity = null;
    }
}

// Generate a filename using local datetime formatted as YYYY-MM-DD_HH:MM:SS.md
function generateFilenameAndHeading() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return {
        filename: `毎日の日本語_${year}-${month}-${day}_${hours}:${minutes}:${seconds}.md`,
        heading: `## 毎日の日本語 ${year}年${month}月${day}日 ${hours}:${minutes}:${seconds}\n`,
    };
}

// Function to handle the "Save As" functionality
async function saveAsFile() {
  if (!hasCompletedAnalysis) {
    alertMessage(elements?.alertMessage, '請等待分析完成後再匯出。', 'info');
    elements?.alertMessage?.classList.add('show');
    return;
  }
  try {
    // The filename should use local datetime, and formatted as: YYYY-MM-DD_HH-MM-SS.md
    const suggestedName = generateFilenameAndHeading(); 
    let text = localStorage.getItem('lastResponse');
    text = suggestedName.heading + "\n" + text;

    const handle = await window.showSaveFilePicker({
      id: 'saveAsFile',
      suggestedName: suggestedName.filename,
      startIn: 'documents',
      types: [{
        description: 'Markdown 檔案',
        accept: {
          'text/markdown': ['.md']
        }
      }],
    });

    const writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
    console.log('File saved successfully!');
  } catch (err) {
    console.error('Error saving file:', err);
  }
}

// Function to handle "Save For Later" button click
async function handleSaveForLater() {
    if (!elements?.saveForLaterBtn) return;
    if (!hasCompletedAnalysis) {
        alertMessage(elements.alertMessage, '請等待分析完成後再儲存。', 'info');
        elements.alertMessage.classList.add('show');
        return;
    }

    // Check if button is already saving
    if (elements.saveForLaterBtn.classList.contains('saving')) return;

    // Get all checked checkboxes
    const checkedWords = document.querySelectorAll('input[name="words"]:checked');
    const checkedGrammars = document.querySelectorAll('input[name="grammars"]:checked');

    // Validate that at least one item is checked
    if (checkedWords.length === 0 && checkedGrammars.length === 0) {
        alertMessage(elements.alertMessage, '請至少選取一個單字或文法重點再儲存。', 'info');
        elements.alertMessage.classList.add('show');
        return;
    }

    // Collect checked values
    const checkedWordValues = Array.from(checkedWords).map(cb => cb.value);
    const checkedGrammarValues = Array.from(checkedGrammars).map(cb => cb.value);

    // Build vocabulary array from checked words
    const words = saveForLaterJson.words
        .filter(word => checkedWordValues.includes(word.term))
        .map(word => ({
            term: word.term,
            detail: word.detail
        }));

    // Build grammar_points array from checked grammars
    const grammars = saveForLaterJson.grammars
        .filter(grammar => checkedGrammarValues.includes(grammar.point))
        .map(grammar => ({
            point: grammar.point,
            explanation: grammar.explanation
        }));

    // Get share checkbox state
    const isShared = elements.shareCheckbox?.checked ?? false;
    const isLoggedIn = authService.isLoggedIn();
    const user = authService.getUser();

    // Build the analysis object
    const analysis = {
        words: words,
        grammars: grammars,

        is_shared: isShared,
        metadata: {
            source_text: localStorage.getItem('lastSelectedText') || '',
            source_url: await getCurrentTabUrl(),
            saved_at: new Date().toISOString()
        }
    };

    // Show loading state
    elements.saveForLaterBtn.classList.add('saving');
    elements.saveForLaterBtn.disabled = true;

    try {
        // Initialize API service and save
        const jaAlchemyApiService = new JaAlchemyApiService();
        
        // Determine userId - only include if logged in and not sharing
        let userId = null;
        if (isLoggedIn && user && !isShared) {
            userId = user.uid;
        }

        const result = await jaAlchemyApiService.saveAnalysis(analysis, userId);

        // Show success message
        const message = isShared 
            ? `已成功儲存 ${result.words_count} 個單字與 ${result.grammars_count} 個文法重點至共享收藏！`
            : `已成功儲存 ${result.words_count} 個單字與 ${result.grammars_count} 個文法重點！`;
        alertMessage(elements.alertMessage, message, 'info');
        elements.alertMessage.classList.add('show');
        // Scroll to top to see the message
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Optional: Uncheck all checkboxes after successful save
        document.querySelectorAll('input[name="words"], input[name="grammars"]').forEach(cb => cb.checked = false);

        console.log('[Save For Later] Save successful:', result);
    } catch (error) {
        console.error('[Save For Later] Save error:', error);
        alertMessage(elements.alertMessage, `儲存項目時發生錯誤：${error.message}`, 'error');
        elements.alertMessage.classList.add('show');
    } finally {
        // Hide loading state
        elements.saveForLaterBtn.classList.remove('saving');
        elements.saveForLaterBtn.disabled = false;
    }
}

// Helper function to get current tab URL
async function getCurrentTabUrl() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab?.url || '';
    } catch (error) {
        console.error('[Save For Later] Error getting tab URL:', error);
        return '';
    }
}

// Handle click outside font size menu
function handleClickOutside(e, elements) {
    if (!elements?.fontSizeBtn?.contains(e.target)) {
      toggleFontSizeMenu(elements, false);
    }
}

// Initialize font size from config
async function initializeFontSize(elements) {
    console.log('[Sidebar] Initializing font size...');
    if (!elements.prose || !elements.fontSizeMenu) return;
    try {
      const savedFontSize = 14;
      elements.prose.style.fontSize = `${savedFontSize}px`;
      elements.prose.style.lineHeight = `calc(2.0rem * ${savedFontSize}/16)`;
      initializeFontSizeMenu(elements, savedFontSize);
    } catch (error) {
      console.error('[Sidebar] Error loading font size preference:', error);
      const defaultSize = 14;
      elements.prose.style.fontSize = `${defaultSize}px`;
      elements.prose.style.lineHeight = `calc(2.0rem * ${defaultSize}/16)`;
      initializeFontSizeMenu(elements, defaultSize);
    }
}

// Initialize font size menu
export function initializeFontSizeMenu(elements, currentSize) {
    console.log('[Sidebar] Initializing font size menu...');
    if (!elements?.fontSizeMenu) return;
  
    // Clear existing options
    elements.fontSizeMenu.innerHTML = '';
  
    // Create options for specific sizes
    const sizes = [12, 14, 16, 18, 20];
    sizes.forEach((size) => {
      const option = document.createElement('div');
      option.className = `font-size-option${size === currentSize ? ' selected' : ''}`;
      option.textContent = `${size}px`;
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        handleFontSizeChange(elements, size);
        toggleFontSizeMenu(elements, false);
      });
      elements.fontSizeMenu.appendChild(option);
    });
    console.log('[Sidebar] Initializing font size menu done.');
}

// Handle font size change
export async function handleFontSizeChange(elements, newSize) {
    if (!elements?.prose) return;
    
    // Update font size through Config
    const validSize = newSize;
    elements.prose.style.fontSize = `${validSize}px`;
    elements.prose.style.lineHeight = `calc(2.0rem * ${validSize}/16)`;
    
    // Update selected state in menu
    const options = elements.fontSizeMenu?.querySelectorAll('.font-size-option');
    options?.forEach((option) => {
      option.classList.toggle('selected', option.textContent === `${validSize}px`);
    });
}
  
// Toggle font size menu
export function toggleFontSizeMenu(elements, show) {
    if (!elements?.fontSizeMenu) return;
    elements.fontSizeMenu.classList.toggle('visible', show);
    // If showing menu, add click outside listener
    if (show) {
      setTimeout(() => {
        document.addEventListener('click', (e) => handleClickOutside(e, elements));
      }, 0);
    } else {
      document.removeEventListener('click', (e) => handleClickOutside(e, elements));
    }
}

export function updateAnalysisModeUi(elements, selectedVariant) {
    elements.analysisModeButtons?.forEach((button) => {
        const isSelected = button.dataset.promptVariant === selectedVariant;
        button.classList.toggle('selected', isSelected);
        button.setAttribute('aria-pressed', String(isSelected));
    });
}

export function redactPersonalProviderApiKey(apiKey) {
    if (typeof apiKey !== 'string' || !apiKey) return '';
    return apiKey.length > 4 ? `••••${apiKey.slice(-4)}` : '••••';
}

function setPersonalProviderFeedback(elements, message = '', type = 'status', focus = false) {
    const feedbackElement = type === 'error'
        ? elements.personalProviderError
        : elements.personalProviderStatus;
    if (!feedbackElement) return;

    feedbackElement.textContent = message;
    feedbackElement.hidden = !message;
    if (focus && message && typeof feedbackElement.focus === 'function') {
        feedbackElement.focus();
    }
}

export function updatePersonalProviderModeUi(elements, mode, isPersonalReady) {
    elements.providerModeButtons?.forEach((button) => {
        const isSelected = button.dataset.providerMode === mode;
        button.classList.toggle('selected', isSelected);
        button.setAttribute('aria-pressed', String(isSelected));
    });

    if (elements.personalProviderModeButton) {
        elements.personalProviderModeButton.setAttribute(
            'aria-describedby',
            isPersonalReady ? 'personalProviderStatus' : 'personalProviderError personalProviderStatus'
        );
    }
}

export function renderPersonalProviderState(elements, state) {
    const { mode, profile, isPersonalReady, personalError } = state;
    updatePersonalProviderModeUi(elements, mode, isPersonalReady);

    if (elements.personalProviderForm) {
        elements.personalProviderForm.hidden = mode !== PERSONAL_PROVIDER_MODE;
    }

    if (elements.personalProviderSummary) {
        elements.personalProviderSummary.textContent = mode === PERSONAL_PROVIDER_MODE
            ? (profile
                ? `個人 · ${profile.model}${isPersonalReady ? '' : ' · 無法使用'}`
                : '個人 · 尚未完成設定')
            : '代管';
    }

    if (elements.personalProviderApiUrl) {
        elements.personalProviderApiUrl.value = profile?.apiUrl || '';
    }
    if (elements.personalProviderModel) {
        elements.personalProviderModel.value = profile?.model || '';
    }
    // Never render a saved credential into the form, even as a masked value.
    if (elements.personalProviderApiKey) {
        elements.personalProviderApiKey.value = '';
    }
    if (elements.clearPersonalProviderButton) {
        elements.clearPersonalProviderButton.disabled = !profile;
    }

    const unavailableMessage = mode === PERSONAL_PROVIDER_MODE && !isPersonalReady
        ? `已選取個人分析，但目前無法使用：${personalError?.message || '請先完成提供者設定。'}`
        : '';
    setPersonalProviderFeedback(elements, unavailableMessage, 'error');
    if (!unavailableMessage) {
        setPersonalProviderFeedback(
            elements,
            profile
                ? (isPersonalReady
                    ? '個人提供者已就緒。選取「代管」即可改用 J-Buddy 服務。'
                    : '個人提供者已儲存，但必須授權存取後才能使用。')
                : '設定一個相容於 OpenAI 的提供者，直接由此擴充功能分析文字。',
            'status'
        );
    }
}

export async function initializePersonalProviderSettings(elements) {
    try {
        const state = await getPersonalProviderState();
        renderPersonalProviderState(elements, state);
        return state;
    } catch (error) {
        updatePersonalProviderModeUi(elements, MANAGED_PROVIDER_MODE, false);
        setPersonalProviderFeedback(
            elements,
            `個人提供者設定無法使用：${error.message}`,
            'error'
        );
        return null;
    }
}

function getPersonalProviderFormValues(elements) {
    return {
        apiUrl: elements.personalProviderApiUrl?.value || '',
        apiKey: elements.personalProviderApiKey?.value || '',
        model: elements.personalProviderModel?.value || '',
    };
}

function focusPersonalProviderField(elements, values) {
    if (!values.apiUrl.trim()) return elements.personalProviderApiUrl?.focus();
    if (!values.apiKey.trim()) return elements.personalProviderApiKey?.focus();
    return elements.personalProviderModel?.focus();
}

export async function handlePersonalProviderSave(elements) {
    const values = getPersonalProviderFormValues(elements);
    if (!values.apiUrl.trim() || !values.apiKey.trim() || !values.model.trim()) {
        setPersonalProviderFeedback(
            elements,
            '請先輸入 HTTPS API 網址、API 金鑰與模型，再進行儲存。',
            'error',
            true
        );
        focusPersonalProviderField(elements, values);
        return null;
    }

    // This synchronous call must remain before the first await in this click
    // handler. It preserves Chrome's user-gesture requirement for optional
    // host permissions while still rejecting invalid URLs before a prompt.
    let pendingPermission;
    try {
        pendingPermission = requestPersonalProviderOriginPermission(values);
    } catch (error) {
        setPersonalProviderFeedback(elements, error.message, 'error', true);
        return null;
    }

    if (elements.savePersonalProviderButton) elements.savePersonalProviderButton.disabled = true;
    setPersonalProviderFeedback(elements, '', 'error');
    setPersonalProviderFeedback(elements, '正在要求提供者存取權…', 'status');
    try {
        await savePersonalProvider(values, pendingPermission);
        await setAnalysisProviderMode(PERSONAL_PROVIDER_MODE);
        const state = await getPersonalProviderState();
        renderPersonalProviderState(elements, state);
        setPersonalProviderFeedback(
            elements,
            '個人提供者已儲存並選取。之後的分析會直接傳送至此提供者。',
            'status',
            true
        );
        return state;
    } catch (error) {
        setPersonalProviderFeedback(elements, error.message, 'error', true);
        return null;
    } finally {
        if (elements.savePersonalProviderButton) elements.savePersonalProviderButton.disabled = false;
    }
}

export async function handlePersonalProviderModeChange(elements, mode) {
    try {
        await setAnalysisProviderMode(mode);
        const state = await getPersonalProviderState();
        renderPersonalProviderState(elements, state);
        setPersonalProviderFeedback(
            elements,
            mode === PERSONAL_PROVIDER_MODE
                ? '已選取個人提供者。之後的分析會直接傳送至此提供者。'
                : '已選取代管提供者。之後的分析會使用 J-Buddy 服務。',
            'status',
            true
        );
        return state;
    } catch (error) {
        const state = await initializePersonalProviderSettings(elements);
        setPersonalProviderFeedback(elements, error.message, 'error', true);
        return state;
    }
}

export async function handlePersonalProviderClear(elements, confirmClear = globalThis.confirm) {
    const confirmed = typeof confirmClear === 'function' && confirmClear(
        '要清除已儲存的 API 網址、API 金鑰、模型與提供者存取權嗎？之後的分析將使用代管提供者。'
    );
    if (!confirmed) return false;

    if (elements.clearPersonalProviderButton) elements.clearPersonalProviderButton.disabled = true;
    try {
        await clearPersonalProvider();
        const state = await getPersonalProviderState();
        renderPersonalProviderState(elements, state);
        setPersonalProviderFeedback(elements, '個人提供者設定已清除，並已選取代管分析。', 'status', true);
        return true;
    } catch (error) {
        setPersonalProviderFeedback(elements, error.message, 'error', true);
        return false;
    } finally {
        if (elements.clearPersonalProviderButton) elements.clearPersonalProviderButton.disabled = false;
    }
}

export async function initializeAnalysisMode(elements) {
    const selectedVariant = await getPromptVariant();
    updateAnalysisModeUi(elements, selectedVariant);
}

export async function handleAnalysisModeChange(elements, variant) {
    const requestId = ++modeChangeRequestId;
    updateAnalysisModeUi(elements, variant);

    try {
        const currentVariant = await getPromptVariant();
        if (!isLatestModeChange(requestId)) return;

        if (variant === currentVariant) {
            updateAnalysisModeUi(elements, variant);
            return;
        }

        const selectedVariant = await setPromptVariant(variant);
        if (!isLatestModeChange(requestId)) return;

        updateAnalysisModeUi(elements, selectedVariant);
        await analizingSelectedText(currentSelectedText, currentContext, {
            force: true,
            promptVariant: selectedVariant,
        });
    } catch (error) {
        if (!isLatestModeChange(requestId)) return;
        console.error('[Sidebar] Failed to change analysis mode:', error);
        alertMessage(elements.alertMessage, `切換分析模式失敗：${error.message}`, 'error');
        elements.alertMessage.classList.add('show');
    }
}

export function setSidepanelElementsForTesting(testElements) {
    elements = testElements;
}

export { isValidSelection };

// DOM element references
let elements = null;

// Initialize DOM elements
async function initElements() {
  elements = {
    prose: document.querySelector('.prose'),
    themeToggle: document.querySelector('#themeToggle'),
    alertMessage: document.querySelector('#alertMessage'),
    copyButton: document.querySelector('.copy-button'),
    fontSizeBtn: document.querySelector('#fontSizeBtn'),
    fontSizeMenu: document.querySelector('#fontSizeMenu'),
    saveAsBtn: document.getElementById('saveAsBtn'),
    saveForLaterBtn: document.getElementById('saveForLaterBtn'),
    shareCheckbox: document.getElementById('shareCheckbox'),
    shareCheckboxContainer: document.getElementById('shareCheckboxContainer'),
    analysisModeButtons: document.querySelectorAll('.analysis-mode-option'),
    providerModeButtons: document.querySelectorAll('.provider-mode-option'),
    personalProviderModeButton: document.querySelector('[data-provider-mode="personal"]'),
    personalProviderForm: document.getElementById('personalProviderForm'),
    personalProviderApiUrl: document.getElementById('personalProviderApiUrl'),
    personalProviderApiKey: document.getElementById('personalProviderApiKey'),
    personalProviderModel: document.getElementById('personalProviderModel'),
    personalProviderSummary: document.getElementById('personalProviderSummary'),
    personalProviderStatus: document.getElementById('personalProviderStatus'),
    personalProviderError: document.getElementById('personalProviderError'),
    savePersonalProviderButton: document.getElementById('savePersonalProviderButton'),
    clearPersonalProviderButton: document.getElementById('clearPersonalProviderButton'),
    result: document.getElementById('result'),
    // Auth elements
    authSection: document.querySelector('#authSection'),
    authSignedOut: document.querySelector('#authSignedOut'),
    authSignedIn: document.querySelector('#authSignedIn'),
    signInBtn: document.querySelector('#signInBtn'),
    signOutBtn: document.querySelector('#signOutBtn'),
    userPhoto: document.querySelector('#userPhoto'),
    userDisplayName: document.querySelector('#userDisplayName'),
    userEmail: document.querySelector('#userEmail')
  };

  // Initialize font size
  await initializeFontSize(elements);
  await initializeAnalysisMode(elements);
  await initializePersonalProviderSettings(elements);
  setCompletedAnalysisAvailable(false);

  return elements;
}

// Update UI based on authentication state
function updateAuthUI() {
    if (!elements) return;

    const user = authService.getUser();
    const isLoggedIn = authService.isLoggedIn();

    console.log('[Auth] Updating UI - Logged in:', isLoggedIn);

    if (isLoggedIn && user) {
        // Show signed-in state
        elements.authSignedOut.style.display = 'none';
        elements.authSignedIn.style.display = 'flex';
        
        // Update user info
        elements.userPhoto.src = user.photoURL || '';
        elements.userDisplayName.textContent = user.displayName || '';
        elements.userEmail.textContent = user.email || '';

        // Sign-in enables persistence capability, but never enables an
        // incomplete/old analysis while a personal stream is still running.
        if (elements.saveForLaterBtn) {
            elements.saveForLaterBtn.disabled = !hasCompletedAnalysis;
        }

        // Enable share checkbox when logged in
        if (elements.shareCheckbox && elements.shareCheckboxContainer) {
            elements.shareCheckbox.disabled = false;
            elements.shareCheckboxContainer.classList.remove('disabled');
        }
    } else {
        // Show signed-out state
        elements.authSignedOut.style.display = 'flex';
        elements.authSignedIn.style.display = 'none';

        // Enable Save For Later button even when logged out (for shared collections)
        if (elements.saveForLaterBtn) {
            elements.saveForLaterBtn.disabled = false;
        }

        // Auto-check share checkbox when logged out (items will be saved as shared)
        if (elements.shareCheckbox && elements.shareCheckboxContainer) {
            elements.shareCheckbox.checked = true;
            elements.shareCheckbox.disabled = true; // Cannot uncheck when not logged in
            elements.shareCheckboxContainer.classList.add('disabled');
        }
    }
}

// Handle sign-in button click
async function handleSignIn() {
    if (!elements?.signInBtn) return;

    // Disable button while signing in
    elements.signInBtn.disabled = true;

    try {
        console.log('[Sidepanel] Initiating sign-in...');
        const user = await authService.signInWithGoogle();
        console.log('[Sidepanel] Sign-in successful:', user.email);
        updateAuthUI();
        
        // Show success message
        alertMessage(elements.alertMessage, `歡迎回來，${user.displayName}！`, 'info');
        elements.alertMessage.classList.add('show');
        
        setTimeout(() => {
            elements.alertMessage.classList.remove('show');
        }, 3000);
    } catch (error) {
        console.error('[Sidepanel] Sign-in error:', error);
        alertMessage(elements.alertMessage, `登入失敗：${error.message}`, 'error');
        elements.alertMessage.classList.add('show');
    } finally {
        elements.signInBtn.disabled = false;
    }
}

// Handle sign-out button click
async function handleSignOut() {
    if (!elements?.signOutBtn) return;

    // Disable button while signing out
    elements.signOutBtn.disabled = true;

    try {
        console.log('[Auth] Initiating sign-out...');
        await authService.signOut();
        console.log('[Auth] Sign-out successful');
        updateAuthUI();
        
        // Show info message
        alertMessage(elements.alertMessage, '您已登出。', 'info');
        elements.alertMessage.classList.add('show');
        
        setTimeout(() => {
            elements.alertMessage.classList.remove('show');
        }, 3000);
    } catch (error) {
        console.error('[Auth] Sign-out error:', error);
        alertMessage(elements.alertMessage, `登出失敗：${error.message}`, 'error');
        elements.alertMessage.classList.add('show');
    } finally {
        elements.signOutBtn.disabled = false;
    }
}

// Set up event listeners
async function setupEventListeners() {
    if (!elements) {
      console.log('[Sidebar] Initializing elements...');
      elements = await initElements();
    }

    // Theme toggle
    elements.themeToggle?.addEventListener('click', () => handleThemeToggle(elements));

    elements.analysisModeButtons?.forEach((button) => {
      button.addEventListener('click', async () => {
        await handleAnalysisModeChange(elements, button.dataset.promptVariant);
      });
    });
    elements.providerModeButtons?.forEach((button) => {
      button.addEventListener('click', async () => {
        await handlePersonalProviderModeChange(elements, button.dataset.providerMode);
      });
    });
    elements.personalProviderForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      await handlePersonalProviderSave(elements);
    });
    elements.clearPersonalProviderButton?.addEventListener('click', async () => {
      await handlePersonalProviderClear(elements);
    });
    // Font size button
    elements.fontSizeBtn?.addEventListener('click', e => {
      e.stopPropagation();
      const isVisible = elements.fontSizeMenu?.classList.contains('visible');
      toggleFontSizeMenu(elements, !isVisible);
    });

    // Save As button
    elements.saveAsBtn?.addEventListener('click', e => {
      e.stopPropagation();
      saveAsFile();
    });

    // Copy button for prose
    elements.copyButton?.addEventListener('click', async () => {
        if (!hasCompletedAnalysis) {
            alertMessage(elements.alertMessage, '請等待分析完成後再複製。', 'info');
            elements.alertMessage.classList.add('show');
            return;
        }
        try {
            const proseContent = localStorage.getItem('lastResponse') || '';
            await navigator.clipboard.writeText(proseContent);

            // Show check icon
            elements.copyButton.classList.add('copied');

            // Reset back to copy icon after 3 seconds
            setTimeout(() => {
                elements.copyButton.classList.remove('copied');
            }, 3000);
        } catch (error) {
            console.error('[Sidebar] Failed to copy text:', error);
        }
    });

    // Save For Later button
    elements.saveForLaterBtn?.addEventListener('click', async () => {
        await handleSaveForLater();
    });

    // Sign in button
    elements.signInBtn?.addEventListener('click', async () => {
        await handleSignIn();
    });

    // Sign out button
    elements.signOutBtn?.addEventListener('click', async () => {
        await handleSignOut();
    });
}

// Initialize theme
async function initializeTheme(elements) {
    const { themeToggle } = elements;
    if (!themeToggle) {
      console.error('[Sidebar] Theme toggle not found');
      return;
    }
  
    // Load default theme and apply immediately
    const savedTheme = 'light';
  
    // Apply theme immediately
    document.documentElement.setAttribute('data-theme', savedTheme);
    await updateThemeIcons(elements, savedTheme === 'dark');
}
  
  // Update theme icons
async function updateThemeIcons(elements, isDark) {
    const {
      themeToggle
    } = elements;
    if (!themeToggle) {
      console.error('[Sidebar] Theme toggle not found');
      return;
    }
    const sunIcon = themeToggle.querySelector('.sun-icon');
    const moonIcon = themeToggle.querySelector('.moon-icon');
    if (!sunIcon || !moonIcon) {
      console.error('[Sidebar] Theme icons not found:', {
        sunIcon: !!sunIcon,
        moonIcon: !!moonIcon
      });
      return;
    }
    sunIcon.style.display = isDark ? 'none' : 'block';
    moonIcon.style.display = isDark ? 'block' : 'none';
}
  
// Handle theme toggle click
async function handleThemeToggle(elements) {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
    document.documentElement.setAttribute('data-theme', newTheme);
    await updateThemeIcons(elements, newTheme === 'dark');
}

// Initialize everything when the document is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize elements and event listeners
    await setupEventListeners();

    // Initialize theme
    await initializeTheme(elements);

    // Wait for authService to finish initializing
    console.log('[Sidepanel] Waiting for authService initialization...');
    await authService.init();
    console.log('[Sidepanel] AuthService initialized');

    // Initialize authentication state
    updateAuthUI();

    // Load selected text
    await loadSelectedText();
});

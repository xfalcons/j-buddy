import { marked } from 'marked';
import authService from '../scripts/authService.js';
import { getPromptVariant } from '../scripts/promptVariant.js';

// Configure marked.js to preserve ruby tags and add classes
marked.setOptions({
  gfm: true,
  breaks: true,
  xhtml: true,
  headerIds: false,
});

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
            const term = lines.shift().trim().replace('<單字>', ''); // First line is the term
            const detail = lines.join('\n').trim(); // The rest is detail
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
            const point = lines.shift().trim().replace('<文法>', ''); // First line is the point
            const explanation = lines.join('\n').trim(); // The rest is explanation
            // push into jsonData.grammars
            if (point) {
                if (!jsonData.grammars) jsonData.grammars = [];
                jsonData.grammars.push({ "point": point, "explanation": explanation });
            }
        });
    }

    // console.log('jsonData after word section:', jsonData);
    resultData.json = jsonData;

    // First convert ruby tags
    const rubyConverted = convertToRuby(markdown);
    // Then parse markdown
    resultData.html = marked.parse(rubyConverted);

    // Add "checkbox" html for "<h4>" headings, with value of "convertFromRuby(heading text)"
    resultData.html = resultData.html.replace(/<h4>(.*?)<\/h4>/g, (match, headingText) => {
        var typename = 'words';
        // check if headingText includes "<文法>" or "<單字>"
        if (headingText.includes('&lt;文法&gt;')) {
            // remove the "<文法>" part
            headingText = headingText.replace('&lt;文法&gt;', '').trim();
            typename = 'grammars';
        } else if (headingText.includes('&lt;單字&gt;')) {
            // remove the "<單字>" part
            headingText = headingText.replace('&lt;單字&gt;', '').trim();
            typename = 'words';
        }
        const convertedHeading = convertFromRuby(headingText);
        return `<h4><input type="checkbox" name="${typename}" value="${convertedHeading}">${headingText}</h4>`;
    });
    // console.log('Formatted HTML:', resultData.html);

    return resultData;
}

// Function to show error message
function alertMessage(element, message, type = 'error') {
    element.innerHTML = `<p>${message}</p>`;
}

// Function to show loading state
function setLoadingState(loadingElement, show) {
    if (show) {
        loadingElement.classList.add('show');
    } else {
        loadingElement.classList.remove('show');
    }
}

// Retrieve and display selected text
async function loadSelectedText() {
  const { selectedText } = await chrome.storage.local.get("selectedText");
  // return selectedText;
  await analizingSelectedText(selectedText);
}

// Update when new selections arrive
chrome.storage.onChanged.addListener(async (changes) => {
  console.log('Storage changes...');  
  if (changes.selectedText) {
    await analizingSelectedText(changes.selectedText.newValue)
  }
});

// Handle messages from background scripts
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === 'textSelectedChanged') {
      await analizingSelectedText(request.data)
    }
    sendResponse({ status: 'success' });
});

let isAnalizing = false;
let saveForLaterJson = {};
let renderThrottleTimer = null;

// Throttled progressive render: re-parses accumulated markdown at most every 80ms
function renderStreamingPreview(proseElement, accumulatedText) {
    if (renderThrottleTimer) return; // already scheduled
    renderThrottleTimer = setTimeout(() => {
        renderThrottleTimer = null;
        const rubyConverted = convertToRuby(accumulatedText);
        proseElement.innerHTML = marked.parse(rubyConverted);
    }, 80);
}

async function analizingSelectedText(selectedText) {
    if (isAnalizing || !selectedText) return;

    const resultElement = document.getElementById('result');
    const proseElement = resultElement.querySelector('.prose');
    const loadingElement = document.getElementById('loading');

    console.log('Analizing Selected Text...');
    isAnalizing = true;

    // Clear previous alertMessage
    elements.alertMessage.classList.remove('show');

    try {
        // Check if selected text equal last selected text (cache hit)
        const storedLastSelectedText = localStorage.getItem('lastSelectedText');
        if (selectedText === storedLastSelectedText) {
            console.log('Selected text is same as last time');
            const storedResponse = localStorage.getItem('lastResponse');
            const analysisResult = formatAnalysisResult(storedResponse);
            saveForLaterJson = analysisResult.json;
            proseElement.innerHTML = analysisResult.html;
            resultElement.classList.add('show');
        } else if (selectedText && selectedText.length >= 2 && selectedText.length < 500) {
            localStorage.setItem('lastSelectedText', selectedText);

            // Show loading state
            setLoadingState(loadingElement, true);

            try {
                console.log('Initializing API service...');
                const jaAlchemyApiService = new JaAlchemyApiService();

                console.log('Generating response (streaming)...');
                let firstChunkReceived = false;

                // Resolve the A/B prompt variant from chrome.storage.local (defaults to "v2").
                const promptVariant = await getPromptVariant();

                await jaAlchemyApiService.generateResponseStream(
                    selectedText,
                    promptVariant,
                    // onChunk: progressively render each chunk
                    (chunk, fullText) => {
                        if (!firstChunkReceived) {
                            firstChunkReceived = true;
                            setLoadingState(loadingElement, false);
                            resultElement.classList.add('show');
                        }
                        renderStreamingPreview(proseElement, fullText);
                    },
                    // onDone: finalize with full formatting (checkboxes, structured data)
                    (fullText) => {
                        localStorage.setItem('lastResponse', fullText);
                        if (renderThrottleTimer) {
                            clearTimeout(renderThrottleTimer);
                            renderThrottleTimer = null;
                        }
                        const analysisResult = formatAnalysisResult(fullText);
                        saveForLaterJson = analysisResult.json;
                        proseElement.innerHTML = analysisResult.html;
                        resultElement.classList.add('show');
                        setLoadingState(loadingElement, false);
                    },
                    // onError
                    (errorMessage) => {
                        console.warn('Streaming API Error:', errorMessage);
                        if (renderThrottleTimer) {
                            clearTimeout(renderThrottleTimer);
                            renderThrottleTimer = null;
                        }
                        alertMessage(elements.alertMessage, `Error calling API service: ${errorMessage}<br>`, 'error');
                        elements.alertMessage.classList.add('show');
                        setLoadingState(loadingElement, false);
                    }
                );
            } catch (apiError) {
                console.warn('Calling API Error:', apiError);
                alertMessage(elements.alertMessage, `Error calling API service: ${apiError.message}<br>`, 'error');
                elements.alertMessage.classList.add('show');
                setLoadingState(loadingElement, false);
            }
        } else {
            alertMessage(elements.alertMessage, 'No text selected or text is too short(2) or too long(120). Please select some text on the page and open the sidepanel again.', 'info');
            elements.alertMessage.classList.add('show');
            elements.result.classList.remove('show');
        }
    } catch (error) {
        console.error('General Error:', error);
        alertMessage(elements.alertMessage, 'Cannot access selected text on this page.', 'error');
        elements.alertMessage.classList.add('show');
        elements.result.classList.remove('show');
        setLoadingState(loadingElement, false);
    }
    isAnalizing = false;
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
        description: 'Markdown file',
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

    // Check if button is already saving
    if (elements.saveForLaterBtn.classList.contains('saving')) return;

    // Get all checked checkboxes
    const checkedWords = document.querySelectorAll('input[name="words"]:checked');
    const checkedGrammars = document.querySelectorAll('input[name="grammars"]:checked');

    // Validate that at least one item is checked
    if (checkedWords.length === 0 && checkedGrammars.length === 0) {
        alertMessage(elements.alertMessage, 'Please select at least one word or grammar point to save.', 'info');
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
            ? `Successfully saved ${result.words_count} vocabulary item(s) and ${result.grammars_count} grammar point(s) to shared collections!`
            : `Successfully saved ${result.words_count} vocabulary item(s) and ${result.grammars_count} grammar point(s)!`;
        alertMessage(elements.alertMessage, message, 'info');
        elements.alertMessage.classList.add('show');
        // Scroll to top to see the message
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Optional: Uncheck all checkboxes after successful save
        document.querySelectorAll('input[name="words"], input[name="grammars"]').forEach(cb => cb.checked = false);

        console.log('[Save For Later] Save successful:', result);
    } catch (error) {
        console.error('[Save For Later] Save error:', error);
        alertMessage(elements.alertMessage, `Error saving items: ${error.message}`, 'error');
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

        // Enable Save For Later button when logged in
        if (elements.saveForLaterBtn) {
            elements.saveForLaterBtn.disabled = false;
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
        alertMessage(elements.alertMessage, `Welcome, ${user.displayName}!`, 'info');
        elements.alertMessage.classList.add('show');
        
        setTimeout(() => {
            elements.alertMessage.classList.remove('show');
        }, 3000);
    } catch (error) {
        console.error('[Sidepanel] Sign-in error:', error);
        alertMessage(elements.alertMessage, `Sign-in failed: ${error.message}`, 'error');
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
        alertMessage(elements.alertMessage, 'You have been signed out.', 'info');
        elements.alertMessage.classList.add('show');
        
        setTimeout(() => {
            elements.alertMessage.classList.remove('show');
        }, 3000);
    } catch (error) {
        console.error('[Auth] Sign-out error:', error);
        alertMessage(elements.alertMessage, `Sign-out failed: ${error.message}`, 'error');
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

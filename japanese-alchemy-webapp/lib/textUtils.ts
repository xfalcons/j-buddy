import { marked } from 'marked';
import DOMPurify from 'dompurify';

const ANALYSIS_ALLOWED_TAGS = [
  'a', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'hr', 'li', 'ol', 'p', 'pre', 'ruby', 'rb', 'rt', 'strong',
  'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul',
];
const ANALYSIS_ALLOWED_ATTR = ['colspan', 'href', 'rowspan', 'title'];

/**
 * Firestore content is user- and provider-controlled. Keep the markdown and
 * ruby markup the dashboard needs, while sanitizing the HTML at every render
 * path that feeds `dangerouslySetInnerHTML`.
 */
export function sanitizeAnalysisHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ANALYSIS_ALLOWED_TAGS,
    ALLOWED_ATTR: ANALYSIS_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Parse furigana text and convert to RUBY HTML tags
 * Example: "{続|つづ}ける" -> "<ruby>続<rt>つづ</rt></ruby>ける"
 */
export function parseFurigana(text: string): string {
  if (!text) return '';
  
  // Replace patterns like {kanji|reading} with ruby tags
  return sanitizeAnalysisHtml(
    text.replace(/\{([^|]+)\|([^}]+)\}/g, '<ruby><rb>$1</rb><rt>$2</rt></ruby>')
  );
}

/**
 * Parse JSON detail field and extract the detail content
 * Returns null if parsing fails
 */
export function parseDetailJson(detailJson: string): string | null {
  if (!detailJson) return null;
  
  try {
    const parsed = JSON.parse(detailJson);
    return parsed.detail || null;
  } catch (error) {
    console.error('Error parsing detail JSON:', error);
    return null;
  }
}

/**
 * Parse JSON explanation field and extract the explanation content
 * Returns null if parsing fails
 */
export function parseExplanationJson(explanationJson: string): string | null {
  if (!explanationJson) return null;
  
  try {
    const parsed = JSON.parse(explanationJson);
    return parsed.explanation || null;
  } catch (error) {
    console.error('Error parsing explanation JSON:', error);
    return null;
  }
}

/**
 * Convert Markdown text to HTML
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown) return '';
  
  return sanitizeAnalysisHtml(marked.parse(markdown) as string);
}

/**
 * Parse vocabulary detail: handle both JSON with detail field and plain text
 * Returns HTML with furigana support and markdown rendering
 */
export function renderVocabularyDetail(detail: string): string {
  if (!detail) return '';

  // Try to parse as JSON first
  const detailContent = parseDetailJson(detail);

  // Add additional newline for better markdown rendering
  const textToRender = "\n  " + (detailContent || detail);

  // Convert furigana patterns to ruby tags BEFORE markdown conversion
  const textWithFurigana = parseFurigana(textToRender);
  
  // Convert markdown to HTML
  const htmlContent = markdownToHtml(textWithFurigana);
  
  return htmlContent;
}

/**
 * Parse grammar explanation: handle both JSON with explanation field and plain text
 * Returns HTML with furigana support and markdown rendering
 */
export function renderGrammarExplanation(explanation: string): string {
  if (!explanation) return '';
  
  // Try to parse as JSON first
  const explanationContent = parseExplanationJson(explanation);
  const textToRender = explanationContent || explanation;
  
  // Convert furigana patterns to ruby tags BEFORE markdown conversion
  const textWithFurigana = parseFurigana(textToRender);
  
  // Convert markdown to HTML
  const htmlContent = markdownToHtml(textWithFurigana);
  
  return htmlContent;
}

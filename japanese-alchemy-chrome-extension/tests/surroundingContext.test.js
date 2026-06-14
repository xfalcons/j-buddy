/**
 * @jest-environment jsdom
 *
 * DOM-touching tests for surrounding-context capture. Uses jsdom so Selection /
 * Range behavior is exercised against a real document tree.
 */
import {
  extractSurroundingContext,
  collapseWhitespace,
} from '../src/scripts/surroundingContext.js';

// Select an exact substring inside a single text node.
function selectSubstring(container, textNode, target) {
  const start = textNode.data.indexOf(target);
  const sel = window.getSelection();
  sel.removeAllRanges();
  const range = document.createRange();
  range.setStart(textNode, start);
  range.setEnd(textNode, start + target.length);
  sel.addRange(range);
  return sel;
}

describe('collapseWhitespace', () => {
  test('collapses runs of whitespace and trims', () => {
    expect(collapseWhitespace('  a\n\nb\t c ')).toBe('a b c');
  });

  test('handles null/undefined input', () => {
    expect(collapseWhitespace(null)).toBe('');
    expect(collapseWhitespace(undefined)).toBe('');
  });
});

describe('extractSurroundingContext', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('returns text immediately before and after a mid-paragraph selection', () => {
    const p = document.createElement('p');
    p.textContent = 'これは前文です。選択されたテキストです。これは後文です。';
    document.body.appendChild(p);
    const sel = selectSubstring(p, p.firstChild, '選択されたテキストです');
    const { before, after } = extractSurroundingContext(sel, { maxChars: 100 });

    expect(before).toContain('これは前文です。');
    expect(after).toContain('これは後文です。');
    // The selected text itself must not appear in either side.
    expect(before + after).not.toContain('選択されたテキストです');
  });

  test('clamps to maxChars keeping the text closest to the selection', () => {
    const beforeText = 'ア'.repeat(300);
    const target = 'ターゲット';
    const afterText = 'イ'.repeat(300);
    const p = document.createElement('p');
    p.textContent = beforeText + target + afterText;
    document.body.appendChild(p);
    const sel = selectSubstring(p, p.firstChild, target);
    const { before, after } = extractSurroundingContext(sel, { maxChars: 50 });

    expect(before.length).toBeLessThanOrEqual(50);
    expect(after.length).toBeLessThanOrEqual(50);
    expect(before).toBe(beforeText.slice(-50));
    expect(after).toBe(afterText.slice(0, 50));
  });

  test('returns empty before when the selection is at the start of the block', () => {
    const p = document.createElement('p');
    p.textContent = '先頭にある選択とその後のテキスト';
    document.body.appendChild(p);
    const tn = p.firstChild;
    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.setStart(tn, 0);
    range.setEnd(tn, 4);
    sel.addRange(range);

    const { before, after } = extractSurroundingContext(sel);
    expect(before).toBe('');
    expect(after).toContain('とその後のテキスト');
  });

  test('returns empty after when the selection is at the end of the block', () => {
    const p = document.createElement('p');
    p.textContent = 'テキストの途中と最後にある選択';
    document.body.appendChild(p);
    const tn = p.firstChild;
    const len = tn.data.length;
    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.setStart(tn, len - 4);
    range.setEnd(tn, len);
    sel.addRange(range);

    const { before, after } = extractSurroundingContext(sel);
    expect(after).toBe('');
    expect(before).toContain('テキストの途中と');
  });

  test('multi-node selection: before from preceding text, after from following text', () => {
    const p = document.createElement('p');
    p.innerHTML = '前文<em>強調</em>選択<em>部分</em>後文';
    document.body.appendChild(p);
    const selNode = Array.from(p.childNodes).find(
      (n) => n.nodeType === Node.TEXT_NODE && n.data === '選択'
    );
    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.setStart(selNode, 0);
    range.setEnd(selNode, selNode.data.length);
    sel.addRange(range);

    const { before, after } = extractSurroundingContext(sel);
    expect(before).toContain('強調');
    expect(after).toContain('部分');
  });

  test('does not cross block boundaries (scoped to nearest block ancestor)', () => {
    const article = document.createElement('article');
    const p1 = document.createElement('p');
    p1.textContent = '別の段落の無関係なテキスト';
    const p2 = document.createElement('p');
    p2.textContent = '同じ段落の前文 選択 後文';
    article.append(p1, p2);
    document.body.appendChild(article);

    const sel = selectSubstring(p2, p2.firstChild, '選択');
    const { before, after } = extractSurroundingContext(sel);

    // Context must NOT include the unrelated previous paragraph.
    expect(before + after).not.toContain('別の段落');
    expect(before).toContain('同じ段落の前文');
    expect(after).toContain('後文');
  });

  test('collapses inter-element whitespace into single spaces', () => {
    const p = document.createElement('p');
    p.innerHTML = '<span>前文</span>  \n  <span>選択</span>  \n  <span>後文</span>';
    document.body.appendChild(p);
    const selNode = p.querySelectorAll('span')[1].firstChild; // "選択" text node
    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.setStart(selNode, 0);
    range.setEnd(selNode, selNode.data.length);
    sel.addRange(range);

    const { before, after } = extractSurroundingContext(sel);
    expect(before).toContain('前文');
    expect(after).toContain('後文');
    // The "  \n  " between spans collapses to a single space.
    expect(before + after).not.toMatch(/\s{2,}/);
  });

  test('returns empty for null, missing, or collapsed selection without throwing', () => {
    expect(extractSurroundingContext(null)).toEqual({ before: '', after: '' });
    expect(extractSurroundingContext(undefined)).toEqual({
      before: '',
      after: '',
    });

    const p = document.createElement('p');
    p.textContent = 'テキスト';
    document.body.appendChild(p);
    const sel = window.getSelection();
    sel.removeAllRanges();
    const range = document.createRange();
    range.setStart(p.firstChild, 0);
    range.collapse(true);
    sel.addRange(range);
    expect(extractSurroundingContext(sel)).toEqual({ before: '', after: '' });
  });

  test('defaults maxChars to 100 when not specified', () => {
    const beforeText = 'ウ'.repeat(250);
    const target = '中心';
    const afterText = 'エ'.repeat(250);
    const p = document.createElement('p');
    p.textContent = beforeText + target + afterText;
    document.body.appendChild(p);
    const sel = selectSubstring(p, p.firstChild, target);
    const { before, after } = extractSurroundingContext(sel);

    expect(before.length).toBeLessThanOrEqual(100);
    expect(after.length).toBeLessThanOrEqual(100);
  });
});

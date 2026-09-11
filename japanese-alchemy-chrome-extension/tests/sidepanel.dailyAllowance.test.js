import {
  dailyAllowanceErrorMessage,
  formatDailyAllowanceReset,
  renderDailyAllowanceStatus,
  setPendingSelection,
  setSidepanelElementsForTesting,
} from '../src/sidepanel/sidepanel.js';

function setupAllowanceElements() {
  const classes = new Set();
  const allowanceStatus = {
    hidden: true,
    textContent: '',
    classList: {
      add: className => classes.add(className),
      remove: className => classes.delete(className),
      contains: className => classes.has(className),
    },
  };
  const allowanceAction = { hidden: true };
  const analyzeButton = { disabled: false };
  setSidepanelElementsForTesting({ allowanceStatus, allowanceAction, analyzeButton });
  return { allowanceStatus, allowanceAction, analyzeButton };
}

describe('daily allowance sidepanel state', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-09T12:00:00Z'));
    setupAllowanceElements();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('formats the UTC reset in local relative and absolute wording', () => {
    expect(formatDailyAllowanceReset(
      '2026-09-10T00:00:00Z',
      new Date('2026-09-09T23:00:00Z')
    )).toMatch(/^1 小時 0 分鐘後重設（.*）$/);
  });

  test('renders current effective remaining allowance without disabling analysis', () => {
    const { allowanceStatus, analyzeButton } = setupAllowanceElements();
    setPendingSelection('テストです');
    renderDailyAllowanceStatus({ limit: 20, remaining: 12, resetAt: '2026-09-10T00:00:00Z' });

    expect(allowanceStatus.hidden).toBe(false);
    expect(allowanceStatus.classList.contains('show')).toBe(true);
    expect(allowanceStatus.textContent).toBe('今日還有 12/20 次共享 AI 分析。');
    expect(analyzeButton.disabled).toBe(false);
  });

  test('suppresses managed analysis until the server-provided reset time', () => {
    const { allowanceStatus, allowanceAction, analyzeButton } = setupAllowanceElements();
    setPendingSelection('テストです');
    renderDailyAllowanceStatus({ limit: 20, remaining: 0, resetAt: '2026-09-09T13:00:00Z' });

    expect(allowanceStatus.textContent).toContain('今日共享 AI 分析已用完');
    expect(allowanceAction.hidden).toBe(false);
    expect(analyzeButton.disabled).toBe(true);

    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(allowanceAction.hidden).toBe(true);
    expect(allowanceStatus.hidden).toBe(true);
    expect(allowanceStatus.classList.contains('show')).toBe(false);
    expect(analyzeButton.disabled).toBe(false);
  });

  test('keeps allowance state unchanged during an enforcement outage', () => {
    const { allowanceStatus, allowanceAction } = setupAllowanceElements();
    const message = dailyAllowanceErrorMessage('fallback', {
      type: 'allowance_enforcement_outage',
    });

    expect(message).toContain('暫時無法確認每日分析額度');
    expect(allowanceStatus.hidden).toBe(true);
    expect(allowanceAction.hidden).toBe(true);
  });

  test('explains that an admitted analysis failure still consumed allowance', () => {
    const { allowanceStatus } = setupAllowanceElements();
    const message = dailyAllowanceErrorMessage('provider unavailable', {
      type: 'admitted_analysis_failure',
      allowance: { limit: 20, remaining: 3, resetAt: '2026-09-10T00:00:00Z' },
    });

    expect(message).toContain('本次嘗試已計入今日共享 AI 分析額度');
    expect(allowanceStatus.textContent).toBe('今日還有 3/20 次共享 AI 分析。');
  });
});

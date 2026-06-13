import { describe, it, expect } from "@jest/globals";
import { SYSTEM_PROMPT_V1 } from "../../src/models/systemPromptV1";

describe("SYSTEM_PROMPT_V1", () => {
  it("is non-empty and includes the grammar analysis section", () => {
    expect(SYSTEM_PROMPT_V1.trim().length).toBeGreaterThan(0);
    expect(SYSTEM_PROMPT_V1).toContain("### 文法分析");
  });

  it("does not hardcode a fixed cap of two grammar points", () => {
    expect(SYSTEM_PROMPT_V1).not.toContain("只能列出二則分析");
  });

  it("instructs a dynamic 1-3 grammar point range", () => {
    expect(SYSTEM_PROMPT_V1).toMatch(/1\s*[〜~\-]\s*3/);
  });

  it("keeps the vocabulary section (script rules 1-4) intact", () => {
    expect(SYSTEM_PROMPT_V1).toContain("### 單字分析");
    expect(SYSTEM_PROMPT_V1).toContain("### 原句");
    expect(SYSTEM_PROMPT_V1).toContain("動詞分類");
  });

  it("instructs grounding in the user's input sentence first", () => {
    expect(SYSTEM_PROMPT_V1).toMatch(/使用者輸入的文句|輸入的文句/);
  });

  describe("grammar example heading/content alignment (R3)", () => {
    const grammarSection =
      SYSTEM_PROMPT_V1.split("### 文法分析")[1] ?? "";
    // Each entry begins after a "#### " heading.
    const entries = grammarSection
      .split(/^####\s+/m)
      .slice(1)
      .map((e) => e.trim())
      .filter(Boolean);

    it("has at least one grammar example heading", () => {
      expect(entries.length).toBeGreaterThan(0);
    });

    it("does not carry over the old mismatched 〜かいがある heading", () => {
      expect(entries.join("\n")).not.toContain("かいがある");
    });

    it("every grammar heading is reflected in its own body", () => {
      for (const entry of entries) {
        const headMatch = entry.match(/<文法>\s*([^\n（(]+)/);
        expect(headMatch).not.toBeNull();
        // Strip the leading "〜" marker — body usage won't include it.
        const patternCore = headMatch![1].trim().replace(/^〜+/, "");
        // Normalize ruby {kanji|reading} -> kanji so kana patterns match cleanly.
        const body = entry
          .split("\n")
          .slice(1)
          .join("\n")
          .replace(/\{([^|}|]+)\|[^}]*\}/g, "$1");
        expect(body).toContain(patternCore);
      }
    });
  });
});

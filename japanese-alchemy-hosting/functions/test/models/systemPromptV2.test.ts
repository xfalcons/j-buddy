import { describe, it, expect } from "@jest/globals";
import { SYSTEM_PROMPT_V2 } from "../../src/models/systemPromptV2";

describe("SYSTEM_PROMPT_V2", () => {
  it("is non-empty and includes the grammar analysis section", () => {
    expect(SYSTEM_PROMPT_V2.trim().length).toBeGreaterThan(0);
    expect(SYSTEM_PROMPT_V2).toContain("### 文法分析");
  });

  it("does not hardcode a fixed cap of two grammar points", () => {
    expect(SYSTEM_PROMPT_V2).not.toContain("只能列出二則分析");
  });

  it("instructs a wider 1-5 grammar point range", () => {
    expect(SYSTEM_PROMPT_V2).toMatch(/1\s*[〜~-]\s*5/);
  });

  it("keeps the shared output structure (same as V1)", () => {
    expect(SYSTEM_PROMPT_V2).toContain("### 原句");
    expect(SYSTEM_PROMPT_V2).toContain("### 單字分析");
    expect(SYSTEM_PROMPT_V2).toContain("### 文法分析");
    expect(SYSTEM_PROMPT_V2).toContain("動詞分類");
  });

  it("instructs grounding in the user's input sentence first", () => {
    expect(SYSTEM_PROMPT_V2).toMatch(/使用者輸入的文句|輸入の文句/);
  });

  // V2-only comprehensive fields (R8-R11)
  it("includes the native-speaker intuition field (母語者語感)", () => {
    expect(SYSTEM_PROMPT_V2).toContain("母語者語感");
  });

  it("includes the literal decomposition field (元素分解)", () => {
    expect(SYSTEM_PROMPT_V2).toContain("元素分解");
  });

  it("includes the similar-pattern comparison instruction", () => {
    expect(SYSTEM_PROMPT_V2).toContain("相似文法比較");
  });

  it("includes the three register labels in the example", () => {
    expect(SYSTEM_PROMPT_V2).toContain("カジュアル");
    expect(SYSTEM_PROMPT_V2).toContain("丁寧");
    expect(SYSTEM_PROMPT_V2).toContain("ビジネス");
  });

  describe("surrounding-context disambiguation instruction", () => {
    it("documents the optional before/after context blocks and the target block", () => {
      expect(SYSTEM_PROMPT_V2).toContain("【前文】");
      expect(SYSTEM_PROMPT_V2).toContain("【分析対象】");
      expect(SYSTEM_PROMPT_V2).toContain("【後文】");
    });

    it("states context is for disambiguation only and must not enter the output", () => {
      expect(SYSTEM_PROMPT_V2).toMatch(/消歧/);
      expect(SYSTEM_PROMPT_V2).toMatch(/不可出現在/);
    });
  });

  describe("grammar example heading/content alignment (R3)", () => {
    const grammarSection =
      SYSTEM_PROMPT_V2.split("### 文法分析")[1] ?? "";
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
        const patternCore = headMatch![1].trim().replace(/^〜+/, "");
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

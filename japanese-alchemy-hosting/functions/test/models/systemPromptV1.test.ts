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
    expect(SYSTEM_PROMPT_V1).toMatch(/1\s*[〜~-]\s*3/);
  });

  it("keeps the vocabulary section (script rules 1-4) intact", () => {
    expect(SYSTEM_PROMPT_V1).toContain("### 單字分析");
    expect(SYSTEM_PROMPT_V1).toContain("### 原句");
    expect(SYSTEM_PROMPT_V1).toContain("動詞分類");
  });

  it("instructs grounding in the user's input sentence first", () => {
    expect(SYSTEM_PROMPT_V1).toMatch(/使用者輸入的文句|輸入的文句/);
  });

  describe("surrounding-context disambiguation instruction", () => {
    it("documents the optional before/after context blocks and the target block", () => {
      expect(SYSTEM_PROMPT_V1).toContain("【前文】");
      expect(SYSTEM_PROMPT_V1).toContain("【分析対象】");
      expect(SYSTEM_PROMPT_V1).toContain("【後文】");
    });

    it("states context is for disambiguation only and must not enter the output", () => {
      expect(SYSTEM_PROMPT_V1).toMatch(/消歧/);
      expect(SYSTEM_PROMPT_V1).toMatch(/不可出現在/);
    });
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

  describe("verb conjugation removed from prompt (U3)", () => {
    // Item 2 is the verb instruction line within the numbered 脚本 list.
    const verbInstruction =
      SYSTEM_PROMPT_V1.split("\n").find((l) => /^2\.\s/.test(l)) ?? "";
    // The worked examples live between the vocabulary and grammar headers.
    const vocabSection = (SYSTEM_PROMPT_V1.split("### 單字分析")[1] ?? "").split(
      "### 文法分析"
    )[0];

    it("verb instruction no longer demands conjugation forms", () => {
      // The old comma-chained demand enumeration is gone from item 2.
      expect(verbInstruction).not.toContain(
        "ます形,た形,ない形,て形,意向形,命令形,使役形,受身形"
      );
      // 受身形(被動形) only ever appeared in the old demand list.
      expect(verbInstruction).not.toContain("受身形(被動形)");
      // The instruction now explicitly delegates forms to the system.
      expect(verbInstruction).toMatch(/由系統自動產生/);
      expect(verbInstruction).toMatch(/請勿輸出/);
    });

    it("verb instruction still requires the engine-needed verb fields", () => {
      // 讀音 is conveyed via the worked examples; item 2 enumerates the rest.
      expect(verbInstruction).toContain("重音");
      expect(verbInstruction).toContain("動詞分類");
      expect(verbInstruction).toContain("解釋");
      expect(verbInstruction).toContain("辭書形");
    });

    it("worked verb examples no longer list conjugation forms", () => {
      expect(vocabSection).not.toContain("使役受身形");
      expect(vocabSection).not.toContain("ます形");
      expect(vocabSection).not.toContain("否定形");
      expect(vocabSection).not.toContain("意向形");
    });

    it("worked verb examples still emit 讀音 and 辭書形", () => {
      expect(vocabSection).toContain("讀音：");
      expect(vocabSection).toContain("辭書形：");
    });

    it("辭書形 still appears in the prompt", () => {
      expect(SYSTEM_PROMPT_V1).toContain("辭書形");
    });

    it("grammar section remains intact", () => {
      expect(SYSTEM_PROMPT_V1).toContain("### 文法分析");
      expect(SYSTEM_PROMPT_V1).toContain("#### <文法>〜として（N3）");
    });
  });
});

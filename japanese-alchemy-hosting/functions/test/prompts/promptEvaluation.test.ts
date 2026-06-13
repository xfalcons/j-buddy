/**
 * Tier 1 prompt evaluation (U6) — runs in the default `npm test`.
 *
 * No real LLM calls. It (1) validates the golden dataset schema, (2) runs every
 * structural check against canonical V1/V2 response exemplars (proving both the
 * checks and the expected response shape are sound and parseable), and (3) proves
 * the checks have teeth by failing a deliberately broken response.
 *
 * The canonical responses (v1-response.md / v2-response.md) are authored for the
 * homograph fixture, so its full check set — including content-coverage — runs here.
 */
import * as fs from "fs";
import * as path from "path";
import { describe, it, expect } from "@jest/globals";
import {
  loadFixtures,
  runChecks,
  parseAnalysis,
  coverage,
  requiredPassRate,
  CHECK_NAMES,
  Fixture,
  PromptVersion,
} from "./checks";

const fixtures = loadFixtures();
const FIXTURES = path.join(__dirname, "fixtures");
const v1Response = fs.readFileSync(path.join(FIXTURES, "v1-response.md"), "utf8");
const v2Response = fs.readFileSync(path.join(FIXTURES, "v2-response.md"), "utf8");

const homograph = fixtures.find((f) => f.id === "homograph-sei-shou-nama-ue");

describe("golden dataset (U5)", () => {
  it("has at least 10 fixtures", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
  });

  it("has unique ids", () => {
    const ids = fixtures.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(fixtures.map((f) => [f.id, f] as [string, Fixture]))(
    "%s is well-formed (required fields, non-empty expectedGrammar, valid targetVersions)",
    (_id, f) => {
      expect(f.input).toBeTruthy();
      expect(f.expectedGrammar.length).toBeGreaterThan(0);
      expect(f.expectedSections).toContain("文法分析");
      expect(f.targetVersions.length).toBeGreaterThan(0);
      for (const v of f.targetVersions) {
        expect(["v1", "v2"]).toContain(v);
      }
      for (const c of f.structuralChecks) {
        expect(c.name).toBeTruthy();
        expect(typeof c.required).toBe("boolean");
      }
    }
  );

  it("declares only checks the runner implements", () => {
    const known = new Set(CHECK_NAMES);
    const declared = new Set(fixtures.flatMap((f) => f.structuralChecks.map((c) => c.name)));
    const unknown = [...declared].filter((n) => !known.has(n));
    expect(unknown).toEqual([]);
  });

  it("every fixture targets at least one prompt version that runs", () => {
    for (const f of fixtures) {
      expect(f.targetVersions.some((v) => v === "v1" || v === "v2")).toBe(true);
    }
  });
});

describe("canonical responses — Tier 1 structural validation (U6)", () => {
  it("v1-response passes every required check for its fixture", () => {
    expect(homograph).toBeDefined();
    const outcomes = runChecks(v1Response, homograph!, "v1");
    const failed = outcomes.filter((o) => o.required && !o.pass);
    expect(failed).toEqual([]);
    expect(requiredPassRate(outcomes)).toBe(1);
  });

  it("v2-response passes every required check for its fixture", () => {
    expect(homograph).toBeDefined();
    const outcomes = runChecks(v2Response, homograph!, "v2");
    const failed = outcomes.filter((o) => o.required && !o.pass);
    expect(failed).toEqual([]);
    expect(requiredPassRate(outcomes)).toBe(1);
  });

  it("v1-response fully covers the fixture's expected vocabulary and grammar", () => {
    const cov = coverage(v1Response, homograph!);
    expect(cov.vocab.covered).toBe(cov.vocab.total);
    expect(cov.grammar.covered).toBe(cov.grammar.total);
  });

  it("v2-response fully covers the fixture's expected vocabulary and grammar", () => {
    const cov = coverage(v2Response, homograph!);
    expect(cov.vocab.covered).toBe(cov.vocab.total);
    expect(cov.grammar.covered).toBe(cov.grammar.total);
  });

  it("both responses parse to non-empty words and grammars arrays", () => {
    for (const resp of [v1Response, v2Response]) {
      const parsed = parseAnalysis(resp);
      expect(parsed.words.length).toBeGreaterThan(0);
      expect(parsed.grammars.length).toBeGreaterThan(0);
    }
  });

  it("v2 grammar entries carry the comprehensive fields (元素分解, 母語者語感)", () => {
    const parsed = parseAnalysis(v2Response);
    const body = parsed.grammars.map((g) => g.explanation).join("\n");
    expect(body).toContain("元素分解");
    expect(body).toContain("母語者語感");
  });
});

describe("checks have teeth — broken response is rejected", () => {
  const broken = [
    "### 原句",
    "  - <ruby>生<rt>なま</rt></ruby>ビール",
    "  - 翻譯：生啤酒",
    "",
    "### 文法分析",
    "",
    "#### <文法>〜だから（N3）",
    "- **接續形式**",
    "  - 名詞 + だ",
    "- **用法說明**",
    "  - 表示原因與理由。",
    "",
    "### 單字分析",
    "#### <單字>ビール",
    "  - 英文：Beer",
    "",
  ].join("\n");

  // Synthetic fixture declaring the checks we want to prove fail.
  const probe: Fixture = {
    id: "broken-probe",
    input: "生ビール",
    difficulty: "probe",
    expectedVocabulary: [],
    expectedGrammar: [],
    expectedSections: ["原句", "單字分析", "文法分析"],
    targetVersions: ["v1" as PromptVersion],
    structuralChecks: [
      { name: "furiganaFormatValid", required: true, description: "" },
      { name: "requiredHeadingsPresent", required: true, description: "" },
      { name: "grammarHeadingMatchesContent", required: true, description: "" },
    ],
  };

  const outcomes = runChecks(broken, probe, "v1");
  const byName = new Map(outcomes.map((o) => [o.name, o]));

  it("rejects raw <ruby> HTML", () => {
    expect(byName.get("furiganaFormatValid")!.pass).toBe(false);
  });

  it("rejects out-of-order section headings", () => {
    expect(byName.get("requiredHeadingsPresent")!.pass).toBe(false);
  });

  it("rejects a grammar heading not reflected in its body", () => {
    expect(byName.get("grammarHeadingMatchesContent")!.pass).toBe(false);
  });
});

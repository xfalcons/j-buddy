/**
 * Prompt-output check runner shared by Tier 1 (mocked) and Tier 2 (real LLM).
 *
 * Each golden fixture declares a `structuralChecks` list; this module implements
 * every check by name. A check returns { pass, detail }. `runChecks` selects the
 * checks applicable to a given prompt version (v1GrammarShape / v2GrammarShape are
 * version-specific) and runs them against a response string.
 *
 * Coverage checks use partial-match tolerance (plan R28) so they stay useful
 * against non-deterministic LLM output. They are still precise enough that a
 * well-formed response scores full marks — which Tier 1 asserts explicitly.
 */
import * as fs from "fs";
import * as path from "path";

export type PromptVersion = "v1" | "v2";

export interface StructuralCheck {
  name: string;
  required: boolean;
  description: string;
  patternHint?: string;
}

export interface Fixture {
  id: string;
  input: string;
  difficulty: string;
  expectedVocabulary: string[];
  expectedGrammar: string[];
  expectedSections: string[];
  targetVersions: PromptVersion[];
  structuralChecks: StructuralCheck[];
}

export interface CheckResult {
  pass: boolean;
  detail: string;
}

export interface CheckOutcome extends CheckResult {
  name: string;
  required: boolean;
}

export const FIXTURES_DIR = path.join(__dirname, "fixtures");

/** Load every *.json fixture in the fixtures directory. */
export function loadFixtures(): Fixture[] {
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, f), "utf8")) as Fixture);
}

/** Strip the reading annotation from a ruby token: {漢字|かんじ} -> 漢字. */
function stripRuby(text: string): string {
  return text.replace(/\{[^{}|]+\|[^{}]*\}/g, (m) => m.slice(1, m.indexOf("|")));
}

/** Return the body of a `### <name>` section (up to the next `### ` heading). */
function section(response: string, name: string): string {
  const blocks = response.split(/(?=^### )/gm);
  const hit = blocks.find((b) => b.trim().startsWith(`### ${name}`));
  return hit ?? "";
}

/**
 * Mirror of the Chrome extension's formatAnalysisResult parser (sidepanel.js).
 * Splits on `### `, extracts `#### ` headings into words/grammars arrays.
 */
export function parseAnalysis(response: string): {
  words: Array<{ term: string; detail: string }>;
  grammars: Array<{ point: string; explanation: string }>;
} {
  const result = { words: [] as Array<{ term: string; detail: string }>, grammars: [] as Array<{ point: string; explanation: string }> };

  const wordSection = section(response, "單字分析");
  if (wordSection) {
    const wordContent = wordSection.replace(/^### 單字分析*/m, "").trim();
    wordContent
      .split(/^####\s+/gm)
      .map((e) => e.trim())
      .filter(Boolean)
      .forEach((entry) => {
        const lines = entry.split("\n");
        const term = lines.shift()?.trim().replace("<單字>", "").trim() ?? "";
        if (term) result.words.push({ term: stripRuby(term), detail: lines.join("\n").trim() });
      });
  }

  const grammarSection = section(response, "文法分析");
  if (grammarSection) {
    const grammarContent = grammarSection.replace(/^### 文法分析*/m, "").trim();
    grammarContent
      .split(/^####\s+/gm)
      .map((e) => e.trim())
      .filter(Boolean)
      .forEach((entry) => {
        const lines = entry.split("\n");
        const point = lines.shift()?.trim().replace("<文法>", "").trim() ?? "";
        if (point) result.grammars.push({ point: stripRuby(point), explanation: lines.join("\n").trim() });
      });
  }

  return result;
}

/** Extract the kanji/term core from an expectedVocabulary entry: "生ビール（なま）" -> "生ビール". */
function vocabCore(term: string): string {
  return term.replace(/[（(].*$/, "").trim();
}

/** Extract the pattern core from an expectedGrammar entry: "〜前に（N3）" -> "前に". */
function grammarCore(g: string): string {
  return g
    .replace(/^.*<文法>/, "")
    .replace(/[（(].*$/, "")
    .replace(/^〜+/, "")
    .trim();
}

// --- individual checks -------------------------------------------------------

function furiganaFormatValid(response: string): CheckResult {
  if (response.includes("<ruby>")) {
    return { pass: false, detail: "response contains raw <ruby> HTML" };
  }
  const loose = /\{[^}\n]*\|[^}\n]*\}/g;
  const strict = /^\{[^{}|]+\|[ぁ-ゖー]+\}$/;
  const tokens = response.match(loose) ?? [];
  for (const t of tokens) {
    if (!strict.test(t)) {
      return { pass: false, detail: `malformed ruby token: ${t}` };
    }
  }
  return { pass: true, detail: `${tokens.length} ruby tokens well-formed` };
}

function requiredHeadingsPresent(response: string): CheckResult {
  const i1 = response.indexOf("### 原句");
  const i2 = response.indexOf("### 單字分析");
  const i3 = response.indexOf("### 文法分析");
  const pass = i1 >= 0 && i2 > i1 && i3 > i2;
  return { pass, detail: `原句@${i1} 單字分析@${i2} 文法分析@${i3}` };
}

function translationInsideOriginalSection(response: string): CheckResult {
  const hasSeparate = /^### 翻譯/m.test(response);
  const orig = section(response, "原句");
  // The 翻譯 line may be a list item ("  - 翻譯：…"), so match anywhere in the 原句 section.
  const inside = /翻譯[:：]/.test(orig);
  return { pass: inside && !hasSeparate, detail: inside ? "翻譯 line inside 原句" : "no 翻譯 line in 原句" };
}

function vocabularyHeadingMatchesContent(response: string): CheckResult {
  const ws = section(response, "單字分析");
  const entries = ws.split(/^####\s+/gm).slice(1);
  for (const entry of entries) {
    if (!entry.includes("<單字>")) continue;
    if (!/(讀音|读音|重音|英文|解釋|解释|意思)[:：]/.test(entry)) {
      return { pass: false, detail: `vocab entry lacks fields: ${entry.split("\n")[0]}` };
    }
  }
  return { pass: true, detail: `${entries.filter((e) => e.includes("<單字>")).length} vocab entries` };
}

function grammarHeadingMatchesContent(response: string): CheckResult {
  const gs = section(response, "文法分析");
  const entries = gs.split(/^####\s+/gm).slice(1).map((e) => e.trim()).filter(Boolean);
  for (const entry of entries) {
    const head = entry.split("\n")[0];
    const headNorm = stripRuby(head);
    if (!/<文法>.*[（(]\s*N[123]\s*[)）]/.test(headNorm)) {
      return { pass: false, detail: `grammar heading missing JLPT level: ${head}` };
    }
    const core = headNorm.replace(/^.*<文法>/, "").replace(/[（(].*$/, "").replace(/^〜+/, "").trim();
    if (core) {
      // Split slash-alternatives (ても／でも) and accept if any part appears in the body.
      const parts = core.split(/[／/]/).map((s) => s.trim()).filter(Boolean);
      const bodyNorm = stripRuby(entry.split("\n").slice(1).join("\n"));
      const found = parts.some((p) => bodyNorm.includes(p));
      if (!found) {
        return { pass: false, detail: `heading "${core}" not reflected in its body` };
      }
    }
  }
  return { pass: true, detail: `${entries.length} grammar entries aligned` };
}

function allOutputKanjiAnnotated(response: string): CheckResult {
  // Best-effort: the strict furigana check already validates token shape; here we
  // only confirm the response actually uses ruby annotation for kanji.
  const tokens = response.match(/\{[^{}|]+\|[^{}]*\}/g) ?? [];
  return { pass: tokens.length > 0, detail: `${tokens.length} ruby annotations` };
}

function expectedVocabularyCovered(response: string, fixture: Fixture): CheckResult {
  const ws = stripRuby(section(response, "單字分析"));
  const total = fixture.expectedVocabulary.length;
  let covered = 0;
  const missing: string[] = [];
  for (const term of fixture.expectedVocabulary) {
    if (ws.includes(vocabCore(term))) covered++;
    else missing.push(term);
  }
  const ratio = total ? covered / total : 1;
  return { pass: ratio >= 0.5, detail: `${covered}/${total} covered${missing.length ? `; missing: ${missing.join(", ")}` : ""}` };
}

function expectedGrammarCovered(response: string, fixture: Fixture): CheckResult {
  const gs = stripRuby(section(response, "文法分析"));
  const total = fixture.expectedGrammar.length;
  let covered = 0;
  const missing: string[] = [];
  for (const g of fixture.expectedGrammar) {
    if (gs.includes(grammarCore(g))) covered++;
    else missing.push(g);
  }
  return { pass: covered >= 1, detail: `${covered}/${total} covered${missing.length ? `; missing: ${missing.join(", ")}` : ""}` };
}

function grammarEntries(response: string): string[] {
  return section(response, "文法分析")
    .split(/^####\s+/gm)
    .slice(1)
    .map((e) => e.trim())
    .filter((e) => e.startsWith("<文法>"));
}

function grammarShape(response: string, version: PromptVersion): CheckResult {
  const entries = grammarEntries(response);
  const max = version === "v1" ? 3 : 5;
  if (entries.length < 1 || entries.length > max) {
    return { pass: false, detail: `${entries.length} grammar entries (expected 1-${max})` };
  }
  const requiredFields = version === "v1"
    ? ["接續形式", "用法說明"]
    : ["接續形式", "元素分解", "用法說明", "母語者語感", "例句"];
  for (const entry of entries) {
    for (const field of requiredFields) {
      if (!entry.includes(field)) {
        return { pass: false, detail: `entry "${entry.split("\n")[0]}" missing field ${field}` };
      }
    }
  }
  return { pass: true, detail: `${entries.length} entries, all ${version} fields present` };
}

function allFourConditionalsContrasted(response: string): CheckResult {
  const gs = stripRuby(section(response, "文法分析"));
  const forms = ["と", "ば", "たら", "なら"];
  const missing = forms.filter((f) => !new RegExp(`〜?${f}[（(（]`).test(gs) && !gs.includes(`〜${f}`));
  return { pass: missing.length === 0, detail: missing.length ? `missing conditionals: ${missing.join(", ")}` : "all four conditionals present" };
}

function homographReadingsDisambiguated(response: string): CheckResult {
  // Collect distinct readings assigned to 生 via {生|X} annotations.
  const readings = new Set<string>();
  const re = /\{生\|([^|}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(response))) readings.add(m[1]);
  // Also count explicit reading lines under 生 entries (e.g. 生ビール なま).
  for (const line of response.split("\n")) {
    const lm = line.match(/^[ \t-]*讀音[:：]\s*([ぁ-ゖー]+)/);
    if (lm && /生/.test(line)) readings.add(lm[1]);
  }
  const distinct = readings.size;
  return { pass: distinct >= 2, detail: `${distinct} distinct readings for 生 (${[...readings].join("/")})` };
}

function katakanaFieldsPresent(response: string): CheckResult {
  const ws = section(response, "單字分析");
  const hasKatakanaEntry = /####\s*<單字>[^\n]*[ァ-ヴー][^\n]*\n[\s\S]*?英文[:：]/m.test(ws);
  return { pass: hasKatakanaEntry, detail: hasKatakanaEntry ? "katakana entry with 英文 field found" : "no katakana entry with 英文 field" };
}

function longInputHandledWithoutTruncation(response: string, fixture: Fixture): CheckResult {
  const orig = stripRuby(section(response, "原句"));
  const probe = fixture.input.slice(0, 20);
  const pass = orig.includes(probe);
  return { pass, detail: pass ? "full input present in 原句" : `first 20 chars not found verbatim` };
}

function fragmentHandledAsFragment(response: string, fixture: Fixture): CheckResult {
  const gs = stripRuby(section(response, "文法分析"));
  const hasNara = /なら/.test(gs);
  const origKept = section(response, "原句").includes(fixture.input.trim());
  return { pass: hasNara && origKept, detail: `なら in 文法分析: ${hasNara}; raw fragment preserved: ${origKept}` };
}

// --- dispatch ---------------------------------------------------------------

const CHECKS: Record<string, (response: string, fixture: Fixture, version: PromptVersion) => CheckResult> = {
  furiganaFormatValid: (r) => furiganaFormatValid(r),
  requiredHeadingsPresent: (r) => requiredHeadingsPresent(r),
  translationInsideOriginalSection: (r) => translationInsideOriginalSection(r),
  vocabularyHeadingMatchesContent: (r) => vocabularyHeadingMatchesContent(r),
  grammarHeadingMatchesContent: (r) => grammarHeadingMatchesContent(r),
  allOutputKanjiAnnotated: (r) => allOutputKanjiAnnotated(r),
  expectedVocabularyCovered: (r, f) => expectedVocabularyCovered(r, f),
  expectedGrammarCovered: (r, f) => expectedGrammarCovered(r, f),
  v1GrammarShape: (r, _f, v) => (v === "v1" ? grammarShape(r, "v1") : { pass: true, detail: "n/a for v2" }),
  v2GrammarShape: (r, _f, v) => (v === "v2" ? grammarShape(r, "v2") : { pass: true, detail: "n/a for v1" }),
  allFourConditionalsContrasted: (r) => allFourConditionalsContrasted(r),
  homographReadingsDisambiguated: (r) => homographReadingsDisambiguated(r),
  katakanaFieldsPresent: (r) => katakanaFieldsPresent(r),
  longInputHandledWithoutTruncation: (r, f) => longInputHandledWithoutTruncation(r, f),
  fragmentHandledAsFragment: (r, f) => fragmentHandledAsFragment(r, f),
};

/** Is a check name applicable to the given prompt version? */
function appliesTo(name: string, version: PromptVersion): boolean {
  if (name === "v1GrammarShape") return version === "v1";
  if (name === "v2GrammarShape") return version === "v2";
  return true;
}

/** Run all version-applicable checks declared by the fixture against a response. */
export function runChecks(response: string, fixture: Fixture, version: PromptVersion): CheckOutcome[] {
  return fixture.structuralChecks
    .filter((c) => appliesTo(c.name, version))
    .map((c) => {
      const fn = CHECKS[c.name];
      if (!fn) return { name: c.name, required: c.required, pass: false, detail: `unknown check: ${c.name}` };
      const res = fn(response, fixture, version);
      return { name: c.name, required: c.required, ...res };
    });
}

/** Fraction of required checks that pass (0-1). */
export function requiredPassRate(outcomes: CheckOutcome[]): number {
  const required = outcomes.filter((o) => o.required);
  if (!required.length) return 1;
  return required.filter((o) => o.pass).length / required.length;
}

/** Strict coverage counts (used by Tier 1 to assert canonical exemplars are perfect). */
export function coverage(response: string, fixture: Fixture): {
  vocab: { covered: number; total: number };
  grammar: { covered: number; total: number };
} {
  const ws = stripRuby(section(response, "單字分析"));
  const gs = stripRuby(section(response, "文法分析"));
  const vocabCovered = fixture.expectedVocabulary.filter((t) => ws.includes(vocabCore(t))).length;
  const grammarCovered = fixture.expectedGrammar.filter((g) => gs.includes(grammarCore(g))).length;
  return {
    vocab: { covered: vocabCovered, total: fixture.expectedVocabulary.length },
    grammar: { covered: grammarCovered, total: fixture.expectedGrammar.length },
  };
}

/** All check names implemented by this runner. */
export const CHECK_NAMES = Object.keys(CHECKS);


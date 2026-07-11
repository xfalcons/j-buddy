/**
 * Deterministic Japanese verb-conjugation engine (client-side).
 *
 * Verb conjugation is one of the most regular morphological systems in any
 * language: exactly four classes (godan, ichidan, suru, kuru) with fully
 * predictable rules. Generating it with an LLM is slow, expensive, and wrong,
 * so the engine produces the nine inflected forms the product surfaces and
 * splices them into the analysis markdown the LLM otherwise emits.
 *
 * Two layers live in this module:
 *   - conjugate(): the pure rule core. Takes a furigana-bearing dictionary form
 *     + a verb class, returns the nine forms with ruby preserved.
 *   - enrichMarkdownWithConjugation(): the markdown preprocessor that drives
 *     the rule core over a 單字分析 section. (See further down.)
 *
 * Pitch accent (重音) is intentionally NOT generated here — it is lexical and
 * not derivable by rule (see the plan's Sources). The LLM continues to supply
 * it; the engine only generates inflected forms.
 */

// --- Verb-class normalization ------------------------------------------------

/**
 * Map the prompt's verb-class labels to a canonical enum.
 *
 * The V1/V2 prompts emit 五段動詞 / 一段動詞 / サ變動詞 / カ變動詞, but the
 * engine must also tolerate the bare variants (五段, サ變, …) and the common
 * English group names so a slightly-different LLM emission still conjugates.
 * 上一段 / 下一段 both collapse to ichidan — they share identical conjugation.
 * @param {string} label
 * @returns {"godan"|"ichidan"|"suru"|"kuru"|null}
 */
export function normalizeVerbClass(label) {
  if (typeof label !== 'string') return null;
  const s = label.trim();
  if (!s) return null;
  if (/五段/.test(s) || /一類/.test(s) || /group\s*1/i.test(s) || /\bu-verb\b/i.test(s) || /^godan$/i.test(s)) {
    return 'godan';
  }
  if (/一段/.test(s) || /二類/.test(s) || /group\s*2/i.test(s) || /\bru-verb\b/i.test(s) || /^ichidan$/i.test(s)) {
    return 'ichidan';
  }
  if (/サ變/.test(s) || /する/.test(s) || /^suru$/i.test(s)) {
    return 'suru';
  }
  if (/カ變/.test(s) || /くる/.test(s) || /^kuru$/i.test(s)) {
    return 'kuru';
  }
  return null;
}

// --- Rule core ---------------------------------------------------------------

/**
 * Replace every `{kanji|reading}` ruby segment with its bare kana reading.
 * Used only for anomaly detection (行く, honorifics) where the rule needs the
 * kana reading; the emitted forms preserve the original ruby structure.
 * @param {string} text
 * @returns {string}
 */
function stripRuby(text) {
  return String(text).replace(/\{[^{}]*\|([^{}]*)\}/g, '$1');
}

// Godan endings, keyed by the dictionary-form final kana. Each value is the
// suffix that REPLACES that final kana for the given form (so the caller keeps
// everything before the final kana and appends this). The あ-row shift that
// drives ない/使役/受身/使役受身 is baked in per kana, including the う → わ
// anomaly (買う → 買わない). て/た carry the onbin (音便) euphonic changes.
// す-ending verbs use the UNCONTRACTED causative-passive (話させられる); the
// contracted 話さされる is avoided as ungrammatical.
const GODAN = {
  く: { masu: 'きます', ta: 'いた', nai: 'かない', te: 'いて', volitional: 'こう', imperative: 'け', causative: 'かせる', passive: 'かれる', causativePassive: 'かされる' },
  ぐ: { masu: 'ぎます', ta: 'いだ', nai: 'がない', te: 'いで', volitional: 'ごう', imperative: 'げ', causative: 'がせる', passive: 'がれる', causativePassive: 'がされる' },
  す: { masu: 'します', ta: 'した', nai: 'さない', te: 'して', volitional: 'そう', imperative: 'せ', causative: 'させる', passive: 'される', causativePassive: 'させられる' },
  つ: { masu: 'ちます', ta: 'った', nai: 'たない', te: 'って', volitional: 'とう', imperative: 'て', causative: 'たせる', passive: 'たれる', causativePassive: 'たされる' },
  ぬ: { masu: 'にます', ta: 'んだ', nai: 'なない', te: 'んで', volitional: 'のう', imperative: 'ね', causative: 'なせる', passive: 'なれる', causativePassive: 'なされる' },
  ぶ: { masu: 'びます', ta: 'んだ', nai: 'ばない', te: 'んで', volitional: 'ぼう', imperative: 'べ', causative: 'ばせる', passive: 'ばれる', causativePassive: 'ばされる' },
  む: { masu: 'みます', ta: 'んだ', nai: 'まない', te: 'んで', volitional: 'もう', imperative: 'め', causative: 'ませる', passive: 'まれる', causativePassive: 'まされる' },
  う: { masu: 'います', ta: 'った', nai: 'わない', te: 'って', volitional: 'おう', imperative: 'え', causative: 'わせる', passive: 'われる', causativePassive: 'わされる' },
  る: { masu: 'ります', ta: 'った', nai: 'らない', te: 'って', volitional: 'ろう', imperative: 'れ', causative: 'らせる', passive: 'られる', causativePassive: 'らされる' },
};

// Ichidan: drop the final る, append the suffix.
const ICHIDAN = {
  masu: 'ます', ta: 'た', nai: 'ない', te: 'て',
  volitional: 'よう', imperative: 'ろ',
  causative: 'させる', passive: 'られる', causativePassive: 'させられる',
};

// Suru: replace the する suffix. The kanji-compound stem (省人化, 結婚, …) is invariant.
const SURU = {
  masu: 'します', ta: 'した', nai: 'しない', te: 'して',
  volitional: 'しよう', imperative: 'しろ',
  causative: 'させる', passive: 'される', causativePassive: 'させられる',
};

// Kuru: replace the くる suffix.
const KURU = {
  masu: 'きます', ta: 'きた', nai: 'こない', te: 'きて',
  volitional: 'こよう', imperative: 'こい',
  causative: 'こさせる', passive: 'こられる', causativePassive: 'こさせられる',
};

// 行く is the one godan く-verb whose te/た form does not follow the regular
// い-onbin (行って / 行った, not 行いて / 行いた). Its other forms are regular.
const IKU_TE = 'って';
const IKU_TA = 'った';

// Godan る-ending honorific verbs whose masu form irregularly takes い instead
// of り (なさる → なさいます, not なさります). Only masu is irregular; every
// other form conjugates regularly. Detection is on the kana reading so a
// ruby-bearing form (rare for these) still matches.
const HONORIFIC_MASU = new Set([
  'いらっしゃる', 'おっしゃる', 'なさる', 'くださる', 'ござる',
]);
const HONORIFIC_MASU_SUFFIX = 'います'; // replaces る with い, then ます

const VALID_CLASSES = new Set(['godan', 'ichidan', 'suru', 'kuru']);

/**
 * Conjugate a verb into its nine inflected forms.
 *
 * @param {string} dictionaryForm - the 辭書形 value, which may carry
 *   `{kanji|reading}` ruby. Ruby segments are preserved byte-for-byte in the
 *   output; only the trailing okurigana (the conjugational ending) transforms.
 * @param {"godan"|"ichidan"|"suru"|"kuru"} verbClass
 * @returns {{masu:string,ta:string,nai:string,te:string,volitional:string,
 *   imperative:string,causative:string,passive:string,causativePassive:string}|null}
 *   The nine forms, or null when the input cannot be conjugated confidently
 *   (unrecognized class, empty/malformed form, unsupported final kana). Never
 *   throws — callers rely on the null skip sentinel.
 */
export function conjugate(dictionaryForm, verbClass) {
  if (typeof dictionaryForm !== 'string' || dictionaryForm.length === 0) return null;
  const cls = typeof verbClass === 'string' ? verbClass.trim().toLowerCase() : '';
  if (!VALID_CLASSES.has(cls)) return null;

  const form = dictionaryForm.trim();
  // Decline malformed ruby up front: { and } are exclusively ruby delimiters in
  // this system, so an unbalanced brace is always malformed input. Without this
  // guard a stray unclosed { would make lastIndexOf('}') return -1, turning the
  // whole string into okurigana and emitting literal-brace garbage that persists
  // into saved items.
  const braceOpens = (form.match(/\{/g) || []).length;
  const braceCloses = (form.match(/\}/g) || []).length;
  if (braceOpens !== braceCloses) return null;
  // Split into a ruby prefix (rendered verbatim) and a trailing okurigana run
  // (the kana that carries the conjugational ending). Conjugation only ever
  // touches the tail; everything up to and including the last ruby segment,
  // plus any kana between ruby segments, is invariant.
  const lastBrace = form.lastIndexOf('}');
  const rubyPrefix = lastBrace === -1 ? '' : form.slice(0, lastBrace + 1);
  const okurigana = lastBrace === -1 ? form : form.slice(lastBrace + 1);
  if (!okurigana) return null;

  // The kana reading (ruby stripped) drives anomaly detection.
  const reading = stripRuby(form);

  let stem; // okurigana with the conjugational ending removed
  let endings; // { form: suffixThatReplacesTheEnding }

  if (cls === 'godan') {
    const finalKana = okurigana[okurigana.length - 1];
    endings = GODAN[finalKana];
    if (!endings) return null; // unsupported final kana (e.g. archaic ふ/ゆ)
    stem = okurigana.slice(0, -1);
    // 行く exception: te/た take っ-onbin (行って/行った) instead of the regular
    // く い-onbin (行いて). Matches the verb in every shape the LLM emits — bare
    // kanji (行く), bare kana (いく), the literary reading ゆく, and compounds
    // (連れて行く, していく, てゆく). Safe to key on the suffix because godan
    // verbs ending in 行く/いく/ゆく are all 行く-derived.
    if (reading.endsWith('行く') || reading.endsWith('いく') || reading.endsWith('ゆく')) {
      endings = { ...endings, te: IKU_TE, ta: IKU_TA };
    }
    // Honorific masu: る → い instead of り.
    if (HONORIFIC_MASU.has(reading)) {
      endings = { ...endings, masu: HONORIFIC_MASU_SUFFIX };
    }
  } else if (cls === 'ichidan') {
    if (!okurigana.endsWith('る')) return null;
    stem = okurigana.slice(0, -1);
    endings = ICHIDAN;
  } else if (cls === 'suru') {
    if (!okurigana.endsWith('する')) return null;
    stem = okurigana.slice(0, -2);
    endings = SURU;
  } else {
    // kuru
    // Suppletive 来る: when ruby-bearing ({来|く}る / {來|く}r) the kanji 来
    // carries the conjugational kana, so its reading alternates き/こ across
    // forms. The byte-for-byte ruby preservation used for the other classes
    // would emit the wrong reading ({来|く}きます), so build per-form ruby
    // explicitly. Bare くる and compound ...くる (e.g. 持ってくる) keep the
    // standard path below.
    const kuruRuby = form.match(/^\{([來来])\|く\}る$/);
    if (kuruRuby) {
      const kanji = kuruRuby[1];
      const ki = `{${kanji}|き}`;
      const ko = `{${kanji}|こ}`;
      return {
        masu: ki + 'ます',
        ta: ki + 'た',
        nai: ko + 'ない',
        te: ki + 'て',
        volitional: ko + 'よう',
        imperative: ko + 'い',
        causative: ko + 'させる',
        passive: ko + 'られる',
        causativePassive: ko + 'させられる',
      };
    }
    if (!okurigana.endsWith('くる')) return null;
    stem = okurigana.slice(0, -2);
    endings = KURU;
  }

  return {
    masu: rubyPrefix + stem + endings.masu,
    ta: rubyPrefix + stem + endings.ta,
    nai: rubyPrefix + stem + endings.nai,
    te: rubyPrefix + stem + endings.te,
    volitional: rubyPrefix + stem + endings.volitional,
    imperative: rubyPrefix + stem + endings.imperative,
    causative: rubyPrefix + stem + endings.causative,
    passive: rubyPrefix + stem + endings.passive,
    causativePassive: rubyPrefix + stem + endings.causativePassive,
  };
}

// --- Markdown enrichment layer (U2) -----------------------------------------

// Form labels in emission order. The engine emits ます形..使役受身形; 否定形 is
// the one label here the engine does NOT emit — it is the prompt's line-14 /
// old-shape variant of ない形. It is kept in this "already-present" list (along
// with て形, which the engine does emit but which also appears in line-14
// entries) so the guard skips entries the LLM filled per the unchanged line-14
// kanji-word rule (which carries 動詞分類 + 辭書形 + its own て形/否定形) and
// old-shape (pre-engine) output — leaving those untouched rather than
// re-conjugating over the LLM's forms.
const EMITTED_FORM_LABELS = [
  'ます形', 'た形', 'ない形', 'て形',
  '意向形', '命令形', '使役形', '受身形', '使役受身形', '否定形',
];

/**
 * Parse one detail line into its indent/list-marker prefix, label, and value.
 * Returns null for lines that are not a `label：value` field (headings, bare
 * text, blank lines). The colon may be full-width (：) or half-width (:).
 * @param {string} rawLine
 * @returns {{prefix:string, label:string, value:string}|null}
 */
function parseDetailLine(rawLine) {
  const m = rawLine.match(/^(\s*(?:[-*]\s+)?)([^：:\n]+)[：:]\s*(.*)$/);
  if (!m) return null;
  return { prefix: m[1], label: m[2].trim(), value: m[3].trim() };
}

/**
 * Enrich a single `#### ` entry block with its conjugation table. Pure and
 * contained: never throws — any parse/conjugation failure returns the block
 * unchanged so one bad entry cannot abort the rest of the section.
 * @param {string} entryBlock
 * @returns {string}
 */
function enrichEntry(entryBlock) {
  try {
    const lines = entryBlock.split('\n');

    let jishoIdx = -1;
    let jishoValue = null;
    let jishoPrefix = '  - ';
    let classRaw = null;
    let alreadyHasForms = false;

    for (let i = 0; i < lines.length; i++) {
      const parsed = parseDetailLine(lines[i]);
      if (!parsed) continue;
      if (parsed.label === '辭書形') {
        jishoIdx = i;
        jishoValue = parsed.value;
        jishoPrefix = parsed.prefix || jishoPrefix;
      } else if (parsed.label === '動詞分類') {
        classRaw = parsed.value;
      }
      if (EMITTED_FORM_LABELS.includes(parsed.label)) {
        alreadyHasForms = true;
      }
    }

    // Already-enriched, or old-shape output the LLM filled with forms: leave
    // the entry exactly as-is (idempotency + graceful degradation).
    if (alreadyHasForms) return entryBlock;
    // No 辭書形 line (or empty value): nothing to conjugate.
    if (jishoIdx === -1 || !jishoValue) return entryBlock;
    // No recognized verb class: not a verb entry, skip.
    const verbClass = normalizeVerbClass(classRaw);
    if (!verbClass) return entryBlock;

    const forms = conjugate(jishoValue, verbClass);
    if (!forms) return entryBlock; // engine declined (malformed dictionary form)

    const formLines = [
      `${jishoPrefix}ます形：${forms.masu}`,
      `${jishoPrefix}た形：${forms.ta}`,
      `${jishoPrefix}ない形：${forms.nai}`,
      `${jishoPrefix}て形：${forms.te}`,
      `${jishoPrefix}意向形：${forms.volitional}`,
      `${jishoPrefix}命令形：${forms.imperative}`,
      `${jishoPrefix}使役形：${forms.causative}`,
      `${jishoPrefix}受身形：${forms.passive}`,
      `${jishoPrefix}使役受身形：${forms.causativePassive}`,
    ];

    // Splice structurally: inject immediately after the 辭書形 line. No flat
    // string-replacement, so a verb term that also appears in another entry's
    // explanation or a grammar example is never mis-targeted.
    const rebuilt = [
      ...lines.slice(0, jishoIdx + 1),
      ...formLines,
      ...lines.slice(jishoIdx + 1),
    ];
    return rebuilt.join('\n');
  } catch (_err) {
    return entryBlock;
  }
}

/**
 * Enrich analysis markdown with engine-generated verb conjugation.
 *
 * Locates the `### 單字分析` section, iterates its `#### ` entries (the same
 * split `formatAnalysisResult` uses), and — for each verb entry that carries a
 * `辭書形` and a recognized `動詞分類` — splices the nine generated form lines
 * in immediately after the `辭書形` line. Non-verb entries, entries missing the
 * required fields, the `### 文法分析` section, and any content outside 單字分析
 * are passed through unchanged. The result is the single enriched source that
 * `onDone` writes to `lastResponse` and hands to `formatAnalysisResult`, so the
 * side-panel render, the saved Firestore item, Copy, Save-As, and the webapp
 * all carry the generated table from one pass.
 *
 * Pure and total: never throws; on any failure or absent 單字分析 section it
 * returns the input unchanged. Re-running on already-enriched markdown is a
 * no-op (idempotent).
 * @param {string} markdown
 * @returns {string}
 */
export function enrichMarkdownWithConjugation(markdown) {
  if (typeof markdown !== 'string' || markdown.length === 0) return markdown;
  try {
    // Use the same ### section boundary formatAnalysisResult parses so
    // enrichment targets the same top-level structure. The per-entry #### split
    // intentionally diverges from the renderer: a lookahead split that keeps
    // each #### block intact for re-joining, where formatAnalysisResult consumes
    // the #### prefix to extract the term.
    const sections = markdown.split(/(?=^### )/gm);
    return sections
      .map((section) => {
        if (!section.trimStart().startsWith('### 單字分析')) return section;
        return section.split(/(?=^#### )/gm).map(enrichEntry).join('');
      })
      .join('');
  } catch (_err) {
    return markdown;
  }
}

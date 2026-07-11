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
    // 行く exception: te/た override the regular く onbin.
    if (reading === '行く' || reading === 'いく') {
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

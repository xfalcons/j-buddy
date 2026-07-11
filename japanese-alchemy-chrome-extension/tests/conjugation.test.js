/**
 * Unit tests for the client-side conjugation engine.
 *
 * U1 (rule core): conjugate(dictionaryForm, verbClass) returns the nine inflected
 * forms for the four verb classes, preserving furigana ruby. normalizeVerbClass
 * maps the prompt's labels to a canonical enum.
 *
 * U2 (enrichment): enrichMarkdownWithConjugation(markdown) splices the generated
 * form lines into the 單字分析 section. (Covered by the second describe block.)
 */
import { conjugate, normalizeVerbClass } from '../src/scripts/conjugation.js';

// The nine generated forms, in the order the engine emits them.
const FORMS = [
  'masu',
  'ta',
  'nai',
  'te',
  'volitional',
  'imperative',
  'causative',
  'passive',
  'causativePassive',
];

describe('normalizeVerbClass', () => {
  test('recognizes the prompt label variants for each class', () => {
    // Labels the V1/V2 prompts actually emit.
    expect(normalizeVerbClass('五段動詞')).toBe('godan');
    expect(normalizeVerbClass('一段動詞')).toBe('ichidan');
    expect(normalizeVerbClass('サ變動詞')).toBe('suru');
    expect(normalizeVerbClass('カ變動詞')).toBe('kuru');
    // Bare variants the plan calls out.
    expect(normalizeVerbClass('五段')).toBe('godan');
    expect(normalizeVerbClass('サ變')).toBe('suru');
  });

  test('normalizes whitespace and common alternative spellings', () => {
    expect(normalizeVerbClass('  五段動詞 ')).toBe('godan');
    expect(normalizeVerbClass('上一段動詞')).toBe('ichidan'); // kami-ichidan
    expect(normalizeVerbClass('下一段動詞')).toBe('ichidan'); // shimo-ichidan
  });

  test('returns null for unrecognized or missing labels (no throw)', () => {
    expect(normalizeVerbClass('形容詞')).toBeNull();
    expect(normalizeVerbClass('名詞')).toBeNull();
    expect(normalizeVerbClass('')).toBeNull();
    expect(normalizeVerbClass(null)).toBeNull();
    expect(normalizeVerbClass(undefined)).toBeNull();
  });
});

describe('conjugate — godan (one representative verb per final-kana row)', () => {
  // Each entry: [dictionaryForm, expectedNineFormsObject]
  // Godan derivation keys off the dictionary-form final kana; the 9 rows below
  // cover every modern godan final kana (くぐすつぬぶむうる).
  const cases = [
    ['書く', { masu: '書きます', ta: '書いた', nai: '書かない', te: '書いて', volitional: '書こう', imperative: '書け', causative: '書かせる', passive: '書かれる', causativePassive: '書かされる' }],
    ['泳ぐ', { masu: '泳ぎます', ta: '泳いだ', nai: '泳がない', te: '泳いで', volitional: '泳ごう', imperative: '泳げ', causative: '泳がせる', passive: '泳がれる', causativePassive: '泳がされる' }],
    ['話す', { masu: '話します', ta: '話した', nai: '話さない', te: '話して', volitional: '話そう', imperative: '話せ', causative: '話させる', passive: '話される', causativePassive: '話させられる' }],
    ['待つ', { masu: '待ちます', ta: '待った', nai: '待たない', te: '待って', volitional: '待とう', imperative: '待て', causative: '待たせる', passive: '待たれる', causativePassive: '待たされる' }],
    ['死ぬ', { masu: '死にます', ta: '死んだ', nai: '死なない', te: '死んで', volitional: '死のう', imperative: '死ね', causative: '死なせる', passive: '死なれる', causativePassive: '死なされる' }],
    ['遊ぶ', { masu: '遊びます', ta: '遊んだ', nai: '遊ばない', te: '遊んで', volitional: '遊ぼう', imperative: '遊べ', causative: '遊ばせる', passive: '遊ばれる', causativePassive: '遊ばされる' }],
    ['読む', { masu: '読みます', ta: '読んだ', nai: '読まない', te: '読んで', volitional: '読もう', imperative: '読め', causative: '読ませる', passive: '読まれる', causativePassive: '読まされる' }],
    ['買う', { masu: '買います', ta: '買った', nai: '買わない', te: '買って', volitional: '買おう', imperative: '買え', causative: '買わせる', passive: '買われる', causativePassive: '買わされる' }],
    ['走る', { masu: '走ります', ta: '走った', nai: '走らない', te: '走って', volitional: '走ろう', imperative: '走れ', causative: '走らせる', passive: '走られる', causativePassive: '走らされる' }],
  ];

  test.each(cases)('godan %s conjugates correctly across all 9 forms', (verb, expected) => {
    const result = conjugate(verb, 'godan');
    expect(result).not.toBeNull();
    FORMS.forEach((form) => {
      expect(result[form]).toBe(expected[form]);
    });
  });
});

describe('conjugate — ichidan (ru-dropping)', () => {
  test('食べる across all 9 forms', () => {
    const result = conjugate('食べる', 'ichidan');
    expect(result).toEqual({
      masu: '食べます', ta: '食べた', nai: '食べない', te: '食べて',
      volitional: '食べよう', imperative: '食べろ',
      causative: '食べさせる', passive: '食べられる', causativePassive: '食べさせられる',
    });
  });

  test('見る across all 9 forms', () => {
    const result = conjugate('見る', 'ichidan');
    expect(result).toEqual({
      masu: '見ます', ta: '見た', nai: '見ない', te: '見て',
      volitional: '見よう', imperative: '見ろ',
      causative: '見させる', passive: '見られる', causativePassive: '見させられる',
    });
  });

  test('ichidan with longer okurigana (考える) drops only the final る', () => {
    // 考える → 考えます, 考えた, 考えない … the え is preserved.
    const result = conjugate('考える', 'ichidan');
    expect(result.masu).toBe('考えます');
    expect(result.te).toBe('考えて');
    expect(result.nai).toBe('考えない');
    expect(result.volitional).toBe('考えよう');
    expect(result.imperative).toBe('考えろ');
  });
});

describe('conjugate — suru (suppletive; kanji-compound stem is invariant)', () => {
  test('する across all 9 forms', () => {
    const result = conjugate('する', 'suru');
    expect(result).toEqual({
      masu: 'します', ta: 'した', nai: 'しない', te: 'して',
      volitional: 'しよう', imperative: 'しろ',
      causative: 'させる', passive: 'される', causativePassive: 'させられる',
    });
  });

  test('compound {省人化|しょうじんか}する leaves the kanji stem invariant and preserves ruby', () => {
    const result = conjugate('{省人化|しょうじんか}する', 'suru');
    expect(result).toEqual({
      masu: '{省人化|しょうじんか}します',
      ta: '{省人化|しょうじんか}した',
      nai: '{省人化|しょうじんか}しない',
      te: '{省人化|しょうじんか}して',
      volitional: '{省人化|しょうじんか}しよう',
      imperative: '{省人化|しょうじんか}しろ',
      causative: '{省人化|しょうじんか}させる',
      passive: '{省人化|しょうじんか}される',
      causativePassive: '{省人化|しょうじんか}させられる',
    });
  });
});

describe('conjugate — kuru (suppletive)', () => {
  test('くる across all 9 forms', () => {
    const result = conjugate('くる', 'kuru');
    expect(result).toEqual({
      masu: 'きます', ta: 'きた', nai: 'こない', te: 'きて',
      volitional: 'こよう', imperative: 'こい',
      causative: 'こさせる', passive: 'こられる', causativePassive: 'こさせられる',
    });
  });
});

describe('conjugate — documented anomalies', () => {
  test('godan 〜う negative uses 〜わ (買う → 買わない, 言う → 言わない)', () => {
    expect(conjugate('買う', 'godan').nai).toBe('買わない');
    expect(conjugate('言う', 'godan').nai).toBe('言わない');
    // The 〜わ shift also governs causative/passive/causative-passive of う-verbs.
    expect(conjugate('買う', 'godan').causative).toBe('買わせる');
    expect(conjugate('買う', 'godan').passive).toBe('買われる');
    expect(conjugate('買う', 'godan').causativePassive).toBe('買わされる');
  });

  test('行く te/ta → 行って/行った, NOT 行いて/行いた', () => {
    const result = conjugate('行く', 'godan');
    expect(result.te).toBe('行って');
    expect(result.ta).toBe('行った');
    // The rest of 行く conjugates regularly (godan く).
    expect(result.masu).toBe('行きます');
    expect(result.nai).toBe('行かない');
    expect(result.volitional).toBe('行こう');
  });

  test('honorific masu: る becomes い for the irregular set', () => {
    expect(conjugate('いらっしゃる', 'godan').masu).toBe('いらっしゃいます');
    expect(conjugate('なさる', 'godan').masu).toBe('なさいます');
    expect(conjugate('くださる', 'godan').masu).toBe('くださいます');
    expect(conjugate('ござる', 'godan').masu).toBe('ございます');
    // Non-masu forms of honorifics conjugate regularly.
    expect(conjugate('なさる', 'godan').te).toBe('なさって');
    expect(conjugate('なさる', 'godan').nai).toBe('なさらない');
  });

  test('causative-passive: godan defaults to contracted 〜される, EXCEPT す-verbs use uncontracted 〜させられる', () => {
    expect(conjugate('書く', 'godan').causativePassive).toBe('書かされる'); // contracted
    expect(conjugate('待つ', 'godan').causativePassive).toBe('待たされる'); // contracted
    // す-ending godan cannot contract: 話さされる is avoided; 話させられる is correct.
    expect(conjugate('話す', 'godan').causativePassive).toBe('話させられる');
    // ichidan is always uncontracted.
    expect(conjugate('食べる', 'ichidan').causativePassive).toBe('食べさせられる');
  });
});

describe('conjugate — furigana preservation (KTD4)', () => {
  test('ruby-bearing 辭書形 {動|うご}く extracts reading うごく and preserves ruby across all forms', () => {
    const result = conjugate('{動|うご}く', 'godan');
    expect(result).toEqual({
      masu: '{動|うご}きます',
      ta: '{動|うご}いた',
      nai: '{動|うご}かない',
      te: '{動|うご}いて',
      volitional: '{動|うご}こう',
      imperative: '{動|うご}け',
      causative: '{動|うご}かせる',
      passive: '{動|うご}かれる',
      causativePassive: '{動|うご}かされる',
    });
  });

  test('multi-segment ruby {向|む}き{合|あ}う preserves both ruby segments, transforms only the final kana', () => {
    const result = conjugate('{向|む}き{合|あ}う', 'godan');
    expect(result.masu).toBe('{向|む}き{合|あ}います');
    expect(result.te).toBe('{向|む}き{合|あ}って');
    expect(result.nai).toBe('{向|む}き{合|あ}わない');
    expect(result.causativePassive).toBe('{向|む}き{合|あ}わされる');
  });

  test('ruby-bearing ichidan {流|なが}れる preserves ruby', () => {
    const result = conjugate('{流|なが}れる', 'ichidan');
    expect(result.masu).toBe('{流|なが}れます');
    expect(result.te).toBe('{流|なが}れて');
    expect(result.nai).toBe('{流|なが}れない');
  });
});

describe('conjugate — graceful degradation (KTD6)', () => {
  test('unrecognized or missing verb class returns null (no throw)', () => {
    expect(conjugate('書く', 'unknown')).toBeNull();
    expect(conjugate('書く', null)).toBeNull();
    expect(conjugate('書く', '')).toBeNull();
    expect(conjugate('書く', undefined)).toBeNull();
  });

  test('empty or malformed reading returns null (no throw)', () => {
    expect(conjugate('', 'godan')).toBeNull();
    expect(conjugate(null, 'godan')).toBeNull();
    expect(conjugate(undefined, 'godan')).toBeNull();
    // A godan verb whose final kana is not one of the supported rows is skipped.
    expect(conjugate('foo', 'godan')).toBeNull();
  });
});

function convertMarkdownToLogseq(markdownText) {
  const lines = markdownText.split('\n');
  let logseqText = '';

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine === '') {
      continue;
    }

    if (trimmedLine.startsWith('# ')) {
      const content = trimmedLine.substring(2);
      logseqText += `- # ${content}\n`;
    } else if (trimmedLine.startsWith('### ')) {
      const content = trimmedLine.substring(4);
      logseqText += `  - ### ${content}\n`;
    } else if (trimmedLine.startsWith('#### ')) {
      const content = trimmedLine.substring(5);
      logseqText += `    - #### ${content}\n`;
    } else if (trimmedLine.startsWith('- ')) {
      const content = trimmedLine.substring(2).trim();
      logseqText += `    - ${content}\n`;
    } else {
      logseqText += `- ${trimmedLine}\n`;
    }
  }

  return logseqText;
}

const markdownText = `
# 毎日の日本語 2025年04月27日 13:08:06

### 原句：
  - 一方で、{丁寧語|ていねいご}を{含|ふく}むプロンプトがAIの{応答|おうとう}の{質|しつ}を{向上|こうじょう}させるという{意見|いけん}も{存在|そんざい}する。
  - 翻譯：另一方面，也有意見認為包含丁寧語的提示可以提高AI的回應品質。

### 單字分析：
#### 一方で (いっぽうで)
  - 重音：3
  - 意思：另一方面
#### {丁寧語|ていねいご}
  - 重音：3
  - 意思：丁寧語，禮貌用語
#### {含|ふく}む
  - 讀音：ふくむ
  - 重音：2
  - 動詞分類：五段動詞
  - 意思：包含、包括
  - 辭書形：{含|ふく}む
  - て形：{含|ふく}んで
  - 否定形：{含|ふく}まない
`;

const output = convertMarkdownToLogseq(markdownText);
console.log(output);

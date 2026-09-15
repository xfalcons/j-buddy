"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

const faqItems = [
  {
    id: "quota",
    question:
      "點擊「開始分析」後出現「呼叫分析服務時發生錯誤：Gemini API error: Too Many Requests」怎麼辦？",
    answer: [
      "這代表 Google Gemini 免費方案的 API 用量已達限制。請稍候一段時間後再重新嘗試；限制重置時間由 Google 的配額規則決定，因此無法保證確切等待時間。",
    ],
    flow: null,
  },
  {
    id: "managed-provider",
    question: "什麼是 LLM API 提供者「代管」？",
    answer: [
      "「代管」代表分析請求會由 J-Buddy 後端代為呼叫 LLM API，並使用 J-Buddy 管理的共用提供者設定。你不需要在擴充功能中輸入 API 金鑰，配額與可用性由 J-Buddy 服務端管理。",
    ],
    flow: {
      label: "代管提供者資料流程",
      title: "代管模式如何送出分析請求",
      steps: [
        "選取網頁上的日文內容",
        "擴充功能將分析請求送到 J-Buddy 後端",
        "J-Buddy 後端使用共用提供者設定呼叫 LLM API",
        "分析結果串流回擴充功能側欄",
      ],
    },
  },
  {
    id: "personal-provider",
    question: "什麼是 LLM API 提供者「個人」？",
    answer: [
      "「個人」代表你自行設定 LLM API 提供者資訊。擴充功能會在目前的瀏覽器設定檔中讀取個人提供者設定，並由瀏覽器擴充功能直接呼叫你設定的提供者；API 金鑰只保存在目前的瀏覽器設定檔，不會傳送給 J-Buddy 後端。",
      "若個人提供者請求失敗，擴充功能會保留錯誤資訊與目前選擇，不會自動改用代管提供者。",
    ],
    flow: {
      label: "個人提供者資料流程",
      title: "個人模式如何送出分析請求",
      steps: [
        "選取網頁上的日文內容",
        "擴充功能從目前瀏覽器設定檔讀取個人提供者設定",
        "擴充功能直接呼叫你設定的 LLM API 提供者",
        "提供者將分析結果串流回擴充功能側欄",
      ],
    },
  },
] as const;

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-background to-muted px-4 py-12">
      <section className="mx-auto max-w-6xl">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-primary">常見問題</h1>
          <p className="mt-3 text-muted-foreground">
            使用 J-Buddy 時的常見疑問與解答。
          </p>
        </header>

        <Tabs
          defaultValue={faqItems[0].id}
          orientation="vertical"
          className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-6"
        >
          <TabsList
            aria-label="常見問題列表"
            className="flex h-auto w-full flex-col items-stretch justify-start gap-2 rounded-none bg-transparent p-0"
          >
            {faqItems.map((item, itemIndex) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                className="h-auto min-h-11 w-full justify-start rounded-lg border border-border bg-card px-4 py-3 text-left text-sm leading-6 whitespace-normal text-foreground shadow-sm data-[state=active]:border-primary data-[state=active]:bg-primary/10 data-[state=active]:text-foreground"
              >
                <span className="mr-2 inline-flex size-6 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-semibold">
                  {itemIndex + 1}
                </span>
                <span className="flex-1">{item.question}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {faqItems.map((item, itemIndex) => (
            <TabsContent
              key={item.id}
              value={item.id}
              className="mt-6 rounded-xl border bg-card p-6 text-card-foreground shadow-sm lg:mt-0"
            >
              <h2 className="text-xl font-semibold leading-8 text-foreground">
                {itemIndex + 1}. {item.question}
              </h2>
              {item.answer.map((paragraph) => (
                <p
                  key={paragraph}
                  className="mt-4 leading-7 text-muted-foreground"
                >
                  {paragraph}
                </p>
              ))}

              {item.flow && (
                <section
                  aria-label={item.flow.label}
                  className="mt-6 rounded-lg border bg-muted/30 p-4"
                >
                  <p className="text-sm font-medium text-foreground">
                    {item.flow.title}
                  </p>
                  <ol className="mt-3 space-y-3 border-l pl-5">
                    {item.flow.steps.map((step, stepIndex) => (
                      <li
                        key={step}
                        className="relative text-sm leading-6 text-muted-foreground"
                      >
                        <span className="absolute top-1 -left-[30px] flex size-5 items-center justify-center rounded-full border bg-background text-[10px] font-semibold text-foreground">
                          {stepIndex + 1}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </section>
    </main>
  );
}

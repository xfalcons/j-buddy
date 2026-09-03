export default function FaqPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-background to-muted px-4 py-12">
      <section className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-primary">常見問題</h1>
          <p className="mt-3 text-muted-foreground">使用 J-Buddy 時的常見疑問與解答。</p>
        </header>

        <section className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">分析服務</h2>
            <details open className="rounded-lg border bg-muted/30 px-4 py-3">
              <summary className="cursor-pointer font-medium text-foreground">
                點擊「開始分析」後出現「呼叫分析服務時發生錯誤：Gemini API error: Too Many Requests」怎麼辦？
              </summary>
              <p className="mt-3 leading-7 text-muted-foreground">
                這代表 Google Gemini 免費方案的 API 用量已達限制。請稍候一段時間後再重新嘗試；限制重置時間由 Google 的配額規則決定，因此無法保證確切等待時間。
              </p>
            </details>
        </section>
      </section>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import {
  getUserVocabularies, 
  getUserGrammars,
  getUserAnalysisPages,
  deleteAnalysisPage,
  getSharedAnalysisPages,
  getSharedVocabularies,
  getSharedGrammars,
} from '@/services/firestoreService';
import { Vocabulary, Grammar, AnalysisPage } from '@/types';
import { 
  parseFurigana, 
  renderVocabularyDetail,
  renderGrammarExplanation,
  markdownToHtml,
} from '@/lib/textUtils';

function safeSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function SharedBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      共享
    </span>
  );
}

function SharedSourceAttribution({ metadata }: { metadata?: { source_text?: string; source_url?: string } }) {
  if (!metadata?.source_text && !safeSourceUrl(metadata?.source_url ?? '')) return null;

  const sourceUrl = safeSourceUrl(metadata?.source_url ?? '');

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {metadata?.source_text && (
        <span dangerouslySetInnerHTML={{ __html: parseFurigana(metadata.source_text) }} />
      )}
      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          來源
        </a>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  
  const [vocabularies, setVocabularies] = useState<Vocabulary[]>([]);
  const [grammars, setGrammars] = useState<Grammar[]>([]);
  const [analysisPages, setAnalysisPages] = useState<AnalysisPage[]>([]);
  const [sharedAnalysisPages, setSharedAnalysisPages] = useState<AnalysisPage[]>([]);
  const [sharedVocabularies, setSharedVocabularies] = useState<Vocabulary[]>([]);
  const [sharedGrammars, setSharedGrammars] = useState<Grammar[]>([]);
  const [activeTab, setActiveTab] = useState('vocabularies');

  useEffect(() => {
    let loadingData = true;
    const loadData = async () => {
      try {
        if (user) {
          const [
            vocabData, grammarData, pagesData,
            sharedPagesData, sharedVocabData, sharedGrammarData,
          ] = await Promise.all([
            getUserVocabularies(user.uid),
            getUserGrammars(user.uid),
            getUserAnalysisPages(user.uid),
            getSharedAnalysisPages(),
            getSharedVocabularies(),
            getSharedGrammars(),
          ]);
          if (!loadingData) return;
          setVocabularies(vocabData);
          setGrammars(grammarData);
          setAnalysisPages(pagesData);
          setSharedAnalysisPages(sharedPagesData);
          setSharedVocabularies(sharedVocabData);
          setSharedGrammars(sharedGrammarData);
        } else {
          const [sharedPagesData, sharedVocabData, sharedGrammarData] = await Promise.all([
            getSharedAnalysisPages(),
            getSharedVocabularies(),
            getSharedGrammars(),
          ]);
          if (!loadingData) return;
          setSharedAnalysisPages(sharedPagesData);
          setSharedVocabularies(sharedVocabData);
          setSharedGrammars(sharedGrammarData);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };

    if (!loading) {
      void loadData();
    }
    return () => {
      loadingData = false;
    };
  }, [user, loading]);

  const handleSignIn = () => {
    router.push('/auth');
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth');
  };

  const handleDeleteAnalysisPage = async (pageId: string) => {
    if (!user) return;
    await deleteAnalysisPage(user.uid, pageId);
    setAnalysisPages((pages) => pages.filter((page) => page.id !== pageId));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">載入中...</div>
      </div>
    );
  }

  const allVocabularies = user ? [...vocabularies, ...sharedVocabularies] : sharedVocabularies;
  const allGrammars = user ? [...grammars, ...sharedGrammars] : sharedGrammars;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      {/* Header */}
      <header className="bg-card border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary">
            J-Buddy: Learning Hub
          </h1>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <span className="text-sm text-muted-foreground">
                  {user.email}
                </span>
                <ThemeToggle />
                <Button onClick={handleSignOut} variant="outline" size="sm">
                  登出
                </Button>
              </>
            ) : (
              <>
                <ThemeToggle />
                <Button onClick={handleSignIn} variant="default" size="sm">
                  登入
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className={`grid w-full max-w-xl ${user ? 'grid-cols-4' : 'grid-cols-3'}`}>
            <TabsTrigger value="vocabularies">
              單字 ({allVocabularies.length})
            </TabsTrigger>
            <TabsTrigger value="grammars">
              文法 ({allGrammars.length})
            </TabsTrigger>
            {user && (
              <TabsTrigger value="pages">
                頁面 ({analysisPages.length})
              </TabsTrigger>
            )}
            <TabsTrigger value="shared-pages">
              共享頁面 ({sharedAnalysisPages.length})
            </TabsTrigger>
          </TabsList>

          {/* Vocabularies Tab */}
          <TabsContent value="vocabularies" className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold">{user ? '我的單字' : '共享單字'}</h2>
              <p className="text-muted-foreground">
                {user ? '查看你的日語單字收藏' : '瀏覽社群共享的日語單字'}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {allVocabularies.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="py-8 text-center">
                    <p className="text-gray-500">找不到單字。</p>
                  </CardContent>
                </Card>
              ) : (
                allVocabularies.map((vocab) => (
                  <Card key={vocab.id} className="flex flex-col">
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        {vocab.isShared && <SharedBadge />}
                        <CardTitle 
                          className="text-xl"
                          dangerouslySetInnerHTML={{ __html: parseFurigana(vocab.term) }}
                        />
                      </div>
                      <CardDescription>
                        {new Date(vocab.createdAt).toLocaleDateString("zh-TW")}
                      </CardDescription>
                      {vocab.isShared && <SharedSourceAttribution metadata={vocab.metadata} />}
                    </CardHeader>
                    <CardContent className="flex-grow">
                      <div 
                        className="text-sm markdown-content"
                        dangerouslySetInnerHTML={{ __html: renderVocabularyDetail(vocab.detail) }}
                      />
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Grammars Tab */}
          <TabsContent value="grammars" className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold">{user ? '我的文法' : '共享文法'}</h2>
              <p className="text-muted-foreground">
                {user ? '查看你的日語文法重點' : '瀏覽社群共享的日語文法重點'}
              </p>
            </div>

            <div className="grid gap-4">
              {allGrammars.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-gray-500">找不到文法重點。</p>
                  </CardContent>
                </Card>
              ) : (
                allGrammars.map((grammar) => (
                  <Card key={grammar.id}>
                    <CardHeader>
                      <div className="flex items-center gap-2">
                        {grammar.isShared && <SharedBadge />}
                        <CardTitle 
                          className="text-xl"
                          dangerouslySetInnerHTML={{ __html: parseFurigana(grammar.point) }}
                        />
                      </div>
                      <CardDescription>
                        {new Date(grammar.createdAt).toLocaleDateString("zh-TW")}
                      </CardDescription>
                      {grammar.isShared && <SharedSourceAttribution metadata={grammar.metadata} />}
                    </CardHeader>
                    <CardContent>
                      <div 
                        className="text-sm markdown-content"
                        dangerouslySetInnerHTML={{ __html: renderGrammarExplanation(grammar.explanation) }}
                      />
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Pages Tab (authenticated only) */}
          {user && (
            <TabsContent value="pages" className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold">我的頁面</h2>
                <p className="text-muted-foreground">
                  瀏覽你儲存的分析頁面
                </p>
              </div>

              <div className="grid gap-4">
                {analysisPages.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-gray-500">找不到分析頁面。</p>
                    </CardContent>
                  </Card>
                ) : (
                  analysisPages.map((page) => {
                    const sourceUrl = safeSourceUrl(page.source_url);

                    return (
                      <Card key={page.id}>
                        <CardHeader>
                          <div className="flex items-start justify-between gap-4">
                            <CardTitle
                              className="text-xl"
                              dangerouslySetInnerHTML={{ __html: parseFurigana(page.source_text) }}
                            />
                            <Button variant="destructive" size="sm" onClick={() => handleDeleteAnalysisPage(page.id)}>
                              刪除
                            </Button>
                          </div>
                          <CardDescription>
                            {new Date(page.createdAt).toLocaleDateString("zh-TW")}
                            {sourceUrl && (
                              <a
                                href={sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-2 text-primary hover:underline"
                              >
                                來源
                              </a>
                            )}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div
                            className="text-sm markdown-content"
                            dangerouslySetInnerHTML={{ __html: markdownToHtml(parseFurigana(page.rendered_markdown)) }}
                          />
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </TabsContent>
          )}

          <TabsContent value="shared-pages" className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold">共享頁面</h2>
              <p className="text-muted-foreground">
                瀏覽其他學習者共享的分析頁面
              </p>
            </div>

            <div className="grid gap-4">
              {sharedAnalysisPages.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-gray-500">找不到共享分析頁面。</p>
                  </CardContent>
                </Card>
              ) : (
                sharedAnalysisPages.map((page) => {
                  const sourceUrl = safeSourceUrl(page.source_url);

                  return (
                    <Card key={page.id}>
                      <CardHeader>
                        <CardTitle
                          className="text-xl"
                          dangerouslySetInnerHTML={{ __html: parseFurigana(page.source_text) }}
                        />
                        <CardDescription>
                          {new Date(page.createdAt).toLocaleDateString("zh-TW")}
                          {sourceUrl && (
                            <a
                              href={sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 text-primary hover:underline"
                            >
                              來源
                            </a>
                          )}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div
                          className="text-sm markdown-content"
                          dangerouslySetInnerHTML={{ __html: markdownToHtml(parseFurigana(page.rendered_markdown)) }}
                        />
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

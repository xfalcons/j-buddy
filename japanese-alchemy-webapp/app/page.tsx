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
  importVocabulary,
  importGrammar,
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

export default function Dashboard() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  
  const [vocabularies, setVocabularies] = useState<Vocabulary[]>([]);
  const [grammars, setGrammars] = useState<Grammar[]>([]);
  const [analysisPages, setAnalysisPages] = useState<AnalysisPage[]>([]);
  const [sharedAnalysisPages, setSharedAnalysisPages] = useState<AnalysisPage[]>([]);
  const [activeTab, setActiveTab] = useState('vocabularies');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;

    let loadingData = true;
    const loadData = async () => {
      console.log('Loading data for user:', user);
      try {
        const [vocabData, grammarData, pagesData, sharedPagesData] = await Promise.all([
          getUserVocabularies(user.uid),
          getUserGrammars(user.uid),
          getUserAnalysisPages(user.uid),
          getSharedAnalysisPages(),
        ]);
        if (!loadingData) return;
        setVocabularies(vocabData);
        setGrammars(grammarData);
        setAnalysisPages(pagesData);
        setSharedAnalysisPages(sharedPagesData);
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };

    void loadData();
    return () => {
      loadingData = false;
    };
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth');
  };

  const handleDeleteAnalysisPage = async (pageId: string) => {
    if (!user) return;
    await deleteAnalysisPage(user.uid, pageId);
    setAnalysisPages((pages) => pages.filter((page) => page.id !== pageId));
  };

  const handleImportVocabulary = async (item: { term: string; detail: string }) => {
    if (!user) return;
    const imported = await importVocabulary(user.uid, item);
    setVocabularies((items) => [imported, ...items]);
  };

  const handleImportGrammar = async (item: { point: string; explanation: string }) => {
    if (!user) return;
    const imported = await importGrammar(user.uid, item);
    setGrammars((items) => [imported, ...items]);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      {/* Header */}
      <header className="bg-card border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary">
            Japanese Alchemy
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user.email}
            </span>
            <ThemeToggle />
            <Button onClick={handleSignOut} variant="outline" size="sm">
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 max-w-xl">
            <TabsTrigger value="vocabularies">
              Vocabularies ({vocabularies.length})
            </TabsTrigger>
            <TabsTrigger value="grammars">
              Grammars ({grammars.length})
            </TabsTrigger>
            <TabsTrigger value="pages">
              Pages ({analysisPages.length})
            </TabsTrigger>
            <TabsTrigger value="shared-pages">
              Shared Pages ({sharedAnalysisPages.length})
            </TabsTrigger>
          </TabsList>

          {/* Vocabularies Tab */}
          <TabsContent value="vocabularies" className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold">My Vocabularies</h2>
              <p className="text-muted-foreground">
                View your Japanese vocabulary collection
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {vocabularies.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="py-8 text-center">
                    <p className="text-gray-500">No vocabularies found.</p>
                  </CardContent>
                </Card>
              ) : (
                vocabularies.map((vocab) => (
                  <Card key={vocab.id} className="flex flex-col">
                    <CardHeader>
                      <CardTitle 
                        className="text-xl"
                        dangerouslySetInnerHTML={{ __html: parseFurigana(vocab.term) }}
                      />
                      <CardDescription>
                        {new Date(vocab.createdAt).toLocaleDateString()}
                      </CardDescription>
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
              <h2 className="text-2xl font-bold">My Grammars</h2>
              <p className="text-muted-foreground">
                View your Japanese grammar points
              </p>
            </div>

            <div className="grid gap-4">
              {grammars.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-gray-500">No grammar points found.</p>
                  </CardContent>
                </Card>
              ) : (
                grammars.map((grammar) => (
                  <Card key={grammar.id}>
                    <CardHeader>
                      <CardTitle 
                        className="text-xl"
                        dangerouslySetInnerHTML={{ __html: parseFurigana(grammar.point) }}
                      />
                      <CardDescription>
                        {new Date(grammar.createdAt).toLocaleDateString()}
                      </CardDescription>
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

          {/* Pages Tab */}
          <TabsContent value="pages" className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold">My Pages</h2>
              <p className="text-muted-foreground">
                Browse your saved analysis pages
              </p>
            </div>

            <div className="grid gap-4">
              {analysisPages.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-gray-500">No analysis pages found.</p>
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
                            Delete
                          </Button>
                        </div>
                        <CardDescription>
                          {new Date(page.createdAt).toLocaleDateString()}
                          {sourceUrl && (
                            <a
                              href={sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 text-primary hover:underline"
                            >
                              Source
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

          <TabsContent value="shared-pages" className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold">Shared Pages</h2>
              <p className="text-muted-foreground">
                Browse analysis pages shared by other learners
              </p>
            </div>

            <div className="grid gap-4">
              {sharedAnalysisPages.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-gray-500">No shared analysis pages found.</p>
                  </CardContent>
                </Card>
              ) : (
                sharedAnalysisPages.map((page) => {
                  const words = page.structured_json?.words ?? [];
                  const grammars = page.structured_json?.grammars ?? [];
                  const sourceUrl = safeSourceUrl(page.source_url);

                  return (
                    <Card key={page.id}>
                      <CardHeader>
                        <CardTitle
                          className="text-xl"
                          dangerouslySetInnerHTML={{ __html: parseFurigana(page.source_text) }}
                        />
                        <CardDescription>
                          {new Date(page.createdAt).toLocaleDateString()}
                          {sourceUrl && (
                            <a
                              href={sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 text-primary hover:underline"
                            >
                              Source
                            </a>
                          )}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <div
                          className="text-sm markdown-content"
                          dangerouslySetInnerHTML={{ __html: markdownToHtml(parseFurigana(page.rendered_markdown)) }}
                        />
                        {page.structured_json ? (
                          <div className="space-y-4 border-t pt-4">
                            <h3 className="font-semibold">Import items</h3>
                            {words.map((word, index) => (
                              <div key={`${word.term}-${index}`} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="font-medium">{word.term}</p>
                                  <div
                                    className="text-sm markdown-content text-muted-foreground"
                                    dangerouslySetInnerHTML={{ __html: renderVocabularyDetail(word.detail) }}
                                  />
                                </div>
                                <Button size="sm" variant="outline" onClick={() => handleImportVocabulary(word)}>
                                  Import vocabulary
                                </Button>
                              </div>
                            ))}
                            {grammars.map((grammar, index) => (
                              <div key={`${grammar.point}-${index}`} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="font-medium">{grammar.point}</p>
                                  <div
                                    className="text-sm markdown-content text-muted-foreground"
                                    dangerouslySetInnerHTML={{ __html: renderGrammarExplanation(grammar.explanation) }}
                                  />
                                </div>
                                <Button size="sm" variant="outline" onClick={() => handleImportGrammar(grammar)}>
                                  Import grammar
                                </Button>
                              </div>
                            ))}
                            {words.length === 0 && grammars.length === 0 && (
                              <p className="text-sm text-muted-foreground">No importable items in this page.</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Structured items are unavailable for this page.</p>
                        )}
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

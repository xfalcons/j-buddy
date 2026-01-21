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
} from '@/services/firestoreService';
import { Vocabulary, Grammar } from '@/types';
import { 
  parseFurigana, 
  renderVocabularyDetail,
  renderGrammarExplanation 
} from '@/lib/textUtils';

export default function Dashboard() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  
  const [vocabularies, setVocabularies] = useState<Vocabulary[]>([]);
  const [grammars, setGrammars] = useState<Grammar[]>([]);
  const [activeTab, setActiveTab] = useState('vocabularies');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    
    // print user for debugging
    console.log('Loading data for user:', user);
    try {
      const [vocabData, grammarData] = await Promise.all([
        getUserVocabularies(user.uid),
        getUserGrammars(user.uid)
      ]);
      setVocabularies(vocabData);
      setGrammars(grammarData);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth');
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
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="vocabularies">
              Vocabularies ({vocabularies.length})
            </TabsTrigger>
            <TabsTrigger value="grammars">
              Grammars ({grammars.length})
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
        </Tabs>
      </main>
    </div>
  );
}

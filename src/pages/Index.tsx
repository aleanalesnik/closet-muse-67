import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import Auth from '@/components/Auth';
import Closet from '@/components/Closet';
import Inspiration from '@/components/Inspiration';
import OutfitBuilder from '@/components/OutfitBuilder';
import { Home, Shirt, Search, User, LogOut } from 'lucide-react';

const Index = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('closet');

  useEffect(() => {
    // Check if user is logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Auth onAuthChange={setUser} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-foreground">Sila 2</h1>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {user.email}
              </span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleSignOut}
                className="flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="border-b border-border bg-card sticky top-0 z-10">
            <div className="max-w-7xl mx-auto">
              <TabsList className="grid w-full grid-cols-3 max-w-md mx-auto">
                <TabsTrigger value="closet" className="flex items-center gap-2">
                  <Shirt className="w-4 h-4" />
                  Closet
                </TabsTrigger>
                <TabsTrigger value="inspiration" className="flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Inspiration
                </TabsTrigger>
                <TabsTrigger value="outfits" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Outfits
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <TabsContent value="closet" className="mt-0">
            <Closet user={user} />
          </TabsContent>

          <TabsContent value="inspiration" className="mt-0">
            <Inspiration user={user} />
          </TabsContent>

          <TabsContent value="outfits" className="mt-0">
            <OutfitBuilder user={user} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Card, CardContent } from "@/components/ui/card";

export default function AuthCallback() {
  const navigate = useNavigate();
  
  useEffect(() => {
    (async () => {
      await supabase.auth.exchangeCodeForSession(window.location.href);
      const { data } = await supabase.auth.getSession();
      navigate(data.session ? "/" : "/");
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/20">
      <Card className="w-full max-w-md">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground">Signing you in…</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
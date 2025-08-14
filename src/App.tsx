import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import InspoTest from "./pages/InspoTest";
import Inspiration from "./pages/Inspiration";
import ItemDetailPage from "./pages/ItemDetailPage";
import MagicLinkSignIn from "./pages/auth/MagicLinkSignIn";
import AuthCallback from "./pages/auth/AuthCallback";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <Toaster />
    <Sonner />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/inspo-test" element={<InspoTest />} />
        <Route path="/inspiration" element={<Inspiration />} />
        <Route path="/item/:id" element={<ItemDetailPage />} />
        <Route path="/sign-in-magic" element={<MagicLinkSignIn />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;

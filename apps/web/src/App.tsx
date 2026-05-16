import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider } from "@/context/AuthContext";
import { AppShell } from "@/components/AppShell";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Predictions from "@/pages/Predictions";
import Leaderboard from "@/pages/Leaderboard";
import Results from "@/pages/Results";
import Profile from "@/pages/Profile";
import Admin from "@/pages/Admin";
import Rules from "@/pages/Rules";
import VerifyEmail from "@/pages/VerifyEmail";
import Payment from "@/pages/Payment";
import VerifyIdentity from "@/pages/VerifyIdentity";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/payment" component={Payment} />
      <Route path="/verify-identity" component={VerifyIdentity} />
      <Route path="/dashboard">
        <AppShell><Dashboard /></AppShell>
      </Route>
      <Route path="/predictions">
        <AppShell><Predictions /></AppShell>
      </Route>
      <Route path="/leaderboard">
        <AppShell><Leaderboard /></AppShell>
      </Route>
      <Route path="/results">
        <AppShell><Results /></AppShell>
      </Route>
      <Route path="/profile">
        <AppShell><Profile /></AppShell>
      </Route>
      <Route path="/admin">
        <AppShell><Admin /></AppShell>
      </Route>
      <Route path="/rules">
        <AppShell><Rules /></AppShell>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import MyLeadsPage from "@/pages/my-leads";
import AllLeadsPage from "@/pages/all-leads";
import LeadDetailPage from "@/pages/lead-detail";
import UploadLeadsPage from "@/pages/admin/upload-leads";
import AssignBatchPage from "@/pages/admin/assign-batch";
import ManageUsersPage from "@/pages/admin/manage-users";

function AdminRoute({ component: Component }: { component: () => JSX.Element }) {
  const { user } = useAuth();
  if (user?.role !== "admin") {
    return (
      <div className="p-6 text-center">
        <p className="font-medium">Access Denied</p>
        <p className="text-sm text-muted-foreground mt-1">You don't have permission to view this page.</p>
      </div>
    );
  }
  return <Component />;
}

function AppRouter() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <Switch>
      <Route path="/" component={isAdmin ? AllLeadsPage : MyLeadsPage} />
      <Route path="/leads" component={AllLeadsPage} />
      <Route path="/leads/:id" component={LeadDetailPage} />
      <Route path="/admin/upload">{() => <AdminRoute component={UploadLeadsPage} />}</Route>
      <Route path="/admin/assign">{() => <AdminRoute component={AssignBatchPage} />}</Route>
      <Route path="/admin/users">{() => <AdminRoute component={ManageUsersPage} />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="space-y-3 text-center">
          <Skeleton className="h-10 w-10 rounded-md mx-auto" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center gap-3 p-3 border-b sticky top-0 z-50 bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <span className="text-sm font-medium text-muted-foreground">SupplyStreamline Onboarding</span>
          </header>
          <main className="flex-1 overflow-auto">
            <AppRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AuthenticatedApp />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

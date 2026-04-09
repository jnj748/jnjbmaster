import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import Tasks from "@/pages/tasks";
import Inspections from "@/pages/inspections";
import TaxSchedules from "@/pages/tax-schedules";
import Vendors from "@/pages/vendors";
import Commissions from "@/pages/commissions";
import Reports from "@/pages/reports";
import Drafts from "@/pages/drafts";
import Tenants from "@/pages/tenants";
import Owners from "@/pages/owners";
import Vehicles from "@/pages/vehicles";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/inspections" component={Inspections} />
        <Route path="/tax-schedules" component={TaxSchedules} />
        <Route path="/vendors" component={Vendors} />
        <Route path="/commissions" component={Commissions} />
        <Route path="/reports" component={Reports} />
        <Route path="/drafts" component={Drafts} />
        <Route path="/tenants" component={Tenants} />
        <Route path="/owners" component={Owners} />
        <Route path="/vehicles" component={Vehicles} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

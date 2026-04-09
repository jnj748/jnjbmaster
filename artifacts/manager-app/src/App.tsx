import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import PortalSelect from "@/pages/portal-select";
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
import VendorPortal from "@/pages/vendor-portal";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function AppRouter() {
  const [location] = useLocation();

  if (location.startsWith("/manager")) {
    return (
      <Layout>
        <Switch>
          <Route path="/manager" component={Dashboard} />
          <Route path="/manager/tasks" component={Tasks} />
          <Route path="/manager/inspections" component={Inspections} />
          <Route path="/manager/tax-schedules" component={TaxSchedules} />
          <Route path="/manager/vendors" component={Vendors} />
          <Route path="/manager/commissions" component={Commissions} />
          <Route path="/manager/reports" component={Reports} />
          <Route path="/manager/drafts" component={Drafts} />
          <Route path="/manager/tenants" component={Tenants} />
          <Route path="/manager/owners" component={Owners} />
          <Route path="/manager/vehicles" component={Vehicles} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
    );
  }

  return (
    <Switch>
      <Route path="/" component={PortalSelect} />
      <Route path="/vendor-portal" component={VendorPortal} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

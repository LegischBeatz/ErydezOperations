import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/shell/AppShell";
import Overview from "@/pages/Overview";
import WorkQueue from "@/pages/WorkQueue";
import Orders from "@/pages/Orders";
import OrderDetail from "@/pages/OrderDetail";
import Inbox from "@/pages/Inbox";
import Fulfillment from "@/pages/Fulfillment";
import Inventory from "@/pages/Inventory";
import Returns from "@/pages/Returns";
import ReturnDetail from "@/pages/ReturnDetail";
import Appointments from "@/pages/Appointments";
import Purchasing from "@/pages/Purchasing";
import Reports from "@/pages/Reports";
import Automations from "@/pages/Automations";
import RunDetail from "@/pages/RunDetail";
import Settings from "@/pages/Settings";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/work" element={<WorkQueue />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:orderId" element={<OrderDetail />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/cases/:caseId" element={<Inbox />} />
          <Route path="/fulfillment" element={<Fulfillment />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/returns" element={<Returns />} />
          <Route path="/returns/:rmaId" element={<ReturnDetail />} />
          <Route path="/appointments" element={<Appointments />} />
          <Route path="/purchasing" element={<Purchasing />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/automations" element={<Automations />} />
          <Route path="/automations/runs/:runId" element={<RunDetail />} />
          <Route path="/settings" element={<Navigate to="/settings/users" replace />} />
          <Route path="/settings/:section" element={<Settings />} />
        </Route>
      </Routes>
      <Toaster position="bottom-right" richColors />
    </BrowserRouter>
  );
}

export default App;

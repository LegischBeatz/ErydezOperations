import "@/App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "@/components/shell/AppShell";
import Overview from "@/pages/Overview";
import Orders from "@/pages/Orders";
import OrderDetail from "@/pages/OrderDetail";
import Products from "@/pages/Products";
import ProductDetail from "@/pages/ProductDetail";
import Inventory from "@/pages/Inventory";
import Customers from "@/pages/Customers";
import CustomerDetail from "@/pages/CustomerDetail";
import Fulfillment from "@/pages/Fulfillment";
import Returns from "@/pages/Returns";
import AuditTimeline from "@/pages/AuditTimeline";
import ProviderLedger from "@/pages/ProviderLedger";
import Settings from "@/pages/Settings";
import { Toaster } from "@/components/ui/sonner";
import { LocaleProvider } from "@/lib/i18n";

function App() {
  return (
    <LocaleProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<Overview />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/:orderId" element={<OrderDetail />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:productId" element={<ProductDetail />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:customerId" element={<CustomerDetail />} />
            <Route path="/fulfillment" element={<Fulfillment />} />
            <Route path="/returns" element={<Returns />} />
            <Route path="/audit-timeline" element={<AuditTimeline />} />
            <Route path="/provider-ledger" element={<ProviderLedger />} />
            <Route path="/settings" element={<Navigate to="/settings/integrations" replace />} />
            <Route path="/settings/:section" element={<Settings />} />
            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Route>
        </Routes>
        <Toaster position="bottom-right" richColors />
      </BrowserRouter>
    </LocaleProvider>
  );
}

export default App;

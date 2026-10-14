import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { seesPage } from "./lib/roles";
import { AuthGate } from "./state/auth";
import { StoreProvider, useStore } from "./state/store";
import { UIProvider } from "./state/ui";
import Layout from "./components/Layout";
import DrawerHost from "./components/Drawer";
import { Toast } from "./components/ui";
import Overview from "./pages/Overview";
import Shops from "./pages/Shops";
import Deliveries from "./pages/Deliveries";
import Sales from "./pages/Sales";
import Production from "./pages/Production";
import Reports from "./pages/Reports";
import History from "./pages/History";
import Setup from "./pages/Setup";

const PAGES = [
  ["shops", Shops], ["deliveries", Deliveries], ["sales", Sales], ["production", Production],
  ["reports", Reports], ["history", History], ["setup", Setup],
];

function AppRoutes() {
  const { me } = useStore();
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        {PAGES.filter(([p]) => seesPage(me, p)).map(([p, Comp]) => (
          <Route key={p} path={p} element={<Comp />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <UIProvider>
      <AuthGate>
        <StoreProvider>
          <BrowserRouter>
            <AppRoutes />
            <DrawerHost />
          </BrowserRouter>
        </StoreProvider>
      </AuthGate>
      <Toast />
    </UIProvider>
  );
}

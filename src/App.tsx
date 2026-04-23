import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import Layout from "./components/layout/Layout";
import Dashboard from "./pages/Dashboard";
import ModelMetrics from "./pages/ModelMetrics";
import PredictionsVsGroundTruth from "./pages/PredictionsVsGroundTruth";
import TransactionSearch from "./pages/TransactionSearch";
import Insights from "./pages/Insights";
import { useThemeStore } from "./store/themeStore";
import { useDataStore } from "./store/dataStore";

export default function App() {
  const theme = useThemeStore((s) => s.theme);
  const bootstrap = useDataStore((s) => s.bootstrap);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="metrics" element={<ModelMetrics />} />
        <Route path="predictions" element={<PredictionsVsGroundTruth />} />
        <Route path="transactions" element={<TransactionSearch />} />
        <Route path="insights" element={<Insights />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

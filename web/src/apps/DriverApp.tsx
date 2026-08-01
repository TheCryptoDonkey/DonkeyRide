import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { DashboardPage } from '../pages/provider/DashboardPage';
import { IncomingTaskPage } from '../pages/provider/IncomingTaskPage';
import { ActiveTaskPage } from '../pages/provider/ActiveTaskPage';
import { CompletionPage } from '../pages/provider/CompletionPage';
import { ExternalRedirect } from './ExternalRedirect';

export function DriverApp() {
  return (
    <Routes>
      <Route element={<Layout app="driver" />}>
        <Route path="/provide" element={<DashboardPage />} />
        <Route path="/provide/incoming" element={<IncomingTaskPage />} />
        <Route path="/provide/active" element={<ActiveTaskPage />} />
        <Route path="/provide/complete" element={<CompletionPage />} />

        {/* Backward-compatible redirects */}
        <Route path="/drive" element={<Navigate to="/provide" replace />} />
        <Route path="/drive/incoming" element={<Navigate to="/provide/incoming" replace />} />
        <Route path="/drive/active" element={<Navigate to="/provide/active" replace />} />
        <Route path="/drive/complete" element={<Navigate to="/provide/complete" replace />} />

        {/* Rider paths belong to the rider app — full navigation */}
        <Route path="/request/*" element={<ExternalRedirect to="/" />} />
        <Route path="/ride/*" element={<ExternalRedirect to="/" />} />

        <Route path="*" element={<Navigate to="/provide" replace />} />
      </Route>
    </Routes>
  );
}

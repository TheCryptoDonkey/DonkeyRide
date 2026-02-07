import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { HomePage } from './pages/requester/HomePage';
import { RequestPage } from './pages/requester/RequestPage';
import { ActiveTaskPage as RequesterActivePage } from './pages/requester/ActiveTaskPage';
import { CompletionPage } from './pages/requester/CompletionPage';
import { DashboardPage } from './pages/provider/DashboardPage';
import { IncomingTaskPage } from './pages/provider/IncomingTaskPage';
import { ActiveTaskPage as ProviderActivePage } from './pages/provider/ActiveTaskPage';
import { CompletionPage as ProviderCompletionPage } from './pages/provider/CompletionPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Requester routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/request" element={<HomePage />} />
        <Route path="/request/new" element={<RequestPage />} />
        <Route path="/request/active" element={<RequesterActivePage />} />
        <Route path="/request/complete" element={<CompletionPage />} />

        {/* Provider routes */}
        <Route path="/provide" element={<DashboardPage />} />
        <Route path="/provide/incoming" element={<IncomingTaskPage />} />
        <Route path="/provide/active" element={<ProviderActivePage />} />
        <Route path="/provide/complete" element={<ProviderCompletionPage />} />

        {/* Backward-compatible redirects */}
        <Route path="/ride" element={<Navigate to="/request" replace />} />
        <Route path="/ride/request" element={<Navigate to="/request/new" replace />} />
        <Route path="/ride/active" element={<Navigate to="/request/active" replace />} />
        <Route path="/ride/complete" element={<Navigate to="/request/complete" replace />} />
        <Route path="/drive" element={<Navigate to="/provide" replace />} />
        <Route path="/drive/incoming" element={<Navigate to="/provide/incoming" replace />} />
        <Route path="/drive/active" element={<Navigate to="/provide/active" replace />} />
        <Route path="/drive/complete" element={<Navigate to="/provide/complete" replace />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

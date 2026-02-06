import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { HomePage } from './pages/requester/HomePage';
import { RequestPage } from './pages/requester/RequestPage';
import { ActiveTaskPage as RequesterActivePage } from './pages/requester/ActiveTaskPage';
import { CompletionPage } from './pages/requester/CompletionPage';
import { DashboardPage } from './pages/provider/DashboardPage';
import { IncomingTaskPage } from './pages/provider/IncomingTaskPage';
import { ActiveTaskPage as ProviderActivePage } from './pages/provider/ActiveTaskPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Requester routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/ride" element={<HomePage />} />
        <Route path="/ride/request" element={<RequestPage />} />
        <Route path="/ride/active" element={<RequesterActivePage />} />
        <Route path="/ride/complete" element={<CompletionPage />} />

        {/* Provider routes */}
        <Route path="/drive" element={<DashboardPage />} />
        <Route path="/drive/incoming" element={<IncomingTaskPage />} />
        <Route path="/drive/active" element={<ProviderActivePage />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

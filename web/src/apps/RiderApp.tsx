import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { HomePage } from '../pages/requester/HomePage';
import { RequestPage } from '../pages/requester/RequestPage';
import { ActiveTaskPage } from '../pages/requester/ActiveTaskPage';
import { CompletionPage } from '../pages/requester/CompletionPage';
import { ExternalRedirect } from './ExternalRedirect';

export function RiderApp() {
  return (
    <Routes>
      <Route element={<Layout app="rider" />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/request" element={<HomePage />} />
        <Route path="/request/new" element={<RequestPage />} />
        <Route path="/request/active" element={<ActiveTaskPage />} />
        <Route path="/request/complete" element={<CompletionPage />} />

        {/* Backward-compatible redirects */}
        <Route path="/ride" element={<Navigate to="/request" replace />} />
        <Route path="/ride/request" element={<Navigate to="/request/new" replace />} />
        <Route path="/ride/active" element={<Navigate to="/request/active" replace />} />
        <Route path="/ride/complete" element={<Navigate to="/request/complete" replace />} />

        {/* Driver paths belong to the driver app — full navigation */}
        <Route path="/provide/*" element={<ExternalRedirect to="/provide" />} />
        <Route path="/drive/*" element={<ExternalRedirect to="/provide" />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

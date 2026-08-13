import { useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Onboarding } from '../components/onboarding/Onboarding';
import { DashboardPage } from '../pages/provider/DashboardPage';
import { IncomingTaskPage } from '../pages/provider/IncomingTaskPage';
import { ActiveTaskPage } from '../pages/provider/ActiveTaskPage';
import { CompletionPage } from '../pages/provider/CompletionPage';
import { EarningsPage } from '../pages/provider/EarningsPage';
import { WorkingAreasPage } from '../pages/provider/WorkingAreasPage';
import { ProfilePage } from '../pages/shared/ProfilePage';
import { HelpPage } from '../pages/shared/HelpPage';
import { ExternalRedirect } from './ExternalRedirect';
import { useTask } from '../context/TaskContext';
import { useDomain } from '../context/DomainContext';
import { useIdentity } from '../context/IdentityContext';
import { useLocation } from '../hooks/useLocation';
import { dispatchService } from '../services/dispatch';
import { onNotificationTapped, takePendingUrl } from '../services/unified-push';

/**
 * App-level dispatch listener: the connection is a module singleton, so an
 * incoming task reaches the driver on any page (Earnings, Profile, ...),
 * not just the dashboard. It also feeds the singleton identity, domain and
 * location, and resumes the shift after a reload wherever the driver lands.
 */
function DispatchTaskListener() {
  const navigate = useNavigate();
  const { activeTask, setActiveTask } = useTask();
  const { profile } = useDomain();
  const { identity } = useIdentity();
  const { location, hasFix } = useLocation();
  const activeTaskRef = useRef(activeTask);
  activeTaskRef.current = activeTask;
  const profileRef = useRef(profile);
  profileRef.current = profile;

  // A real device fix, not the placeholder. Never inferred from the absence
  // of an error — see useLocation.
  const geoReady = hasFix;

  useEffect(() => {
    if (identity) {
      dispatchService.setIdentity({ pubKeyHex: identity.pubKeyHex, npub: identity.npub });
    }
  }, [identity]);

  useEffect(() => {
    if (profile) dispatchService.setDomain(profile.id);
  }, [profile]);

  useEffect(() => {
    dispatchService.updateLocation(geoReady ? location : null);
  }, [geoReady, location]);

  // Resume the shift after a reload if the driver was online
  useEffect(() => {
    if (dispatchService.wasOnline() && !dispatchService.isOnline() && identity && geoReady) {
      dispatchService.goOnline();
    }
  }, [identity, geoReady]);

  useEffect(() => dispatchService.onTask((task, distanceKm) => {
    const current = activeTaskRef.current;
    const terminal = profileRef.current?.states.terminal || [];
    // A job already in hand keeps the screen — the broadcast still lands
    // in the dashboard's available-jobs list, so nothing is lost
    if (current && !terminal.includes(current.status)) return;
    setActiveTask(distanceKm != null && task.distanceKm == null
      ? { ...task, distanceKm }
      : task);
    navigate('/provide/incoming');
  }), [navigate, setActiveTask]);

  // A tapped job notification in the native app. Two cases: the tap woke a
  // dead process (the path was stored, so it is read once here on start),
  // or the app was already running (the plugin says so live).
  useEffect(() => {
    let cancelled = false;
    void takePendingUrl().then((url) => {
      if (url && !cancelled) navigate(url);
    });
    const listener = onNotificationTapped((url) => navigate(url));
    return () => {
      cancelled = true;
      void listener.then((handle) => handle?.remove());
    };
  }, [navigate]);

  return null;
}

export function DriverApp() {
  return (
    <Onboarding role="provider">
      <DispatchTaskListener />
      <Routes>
        <Route element={<Layout app="driver" />}>
          <Route path="/provide" element={<DashboardPage />} />
          <Route path="/provide/incoming" element={<IncomingTaskPage />} />
          <Route path="/provide/active" element={<ActiveTaskPage />} />
          <Route path="/provide/complete" element={<CompletionPage />} />
          <Route path="/provide/earnings" element={<EarningsPage />} />
          <Route path="/provide/areas" element={<WorkingAreasPage />} />
          <Route path="/provide/profile" element={<ProfilePage role="provider" />} />
          <Route path="/provide/help" element={<HelpPage role="provider" />} />

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
    </Onboarding>
  );
}

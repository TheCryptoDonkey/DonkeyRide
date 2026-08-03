import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { DriverApp } from './apps/DriverApp';
import { DomainProvider } from './context/DomainContext';
import { IdentityProvider } from './context/IdentityContext';
import { TaskProvider } from './context/TaskContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { registerServiceWorker } from './pwa';
import { initTheme } from './utils/theme';
import './index.css';

// Before render: flipping the whole page a beat after load looks broken
initTheme();
registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <DomainProvider>
          <IdentityProvider fixedRole="provider">
            <TaskProvider>
              <DriverApp />
            </TaskProvider>
          </IdentityProvider>
        </DomainProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);

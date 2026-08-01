import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { DomainProvider } from './context/DomainContext';
import { IdentityProvider } from './context/IdentityContext';
import { TaskProvider } from './context/TaskContext';
import './index.css';

// Install the service worker in production builds only — dev servers and
// HMR fight with SW caching
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <DomainProvider>
        <IdentityProvider>
          <TaskProvider>
            <App />
          </TaskProvider>
        </IdentityProvider>
      </DomainProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

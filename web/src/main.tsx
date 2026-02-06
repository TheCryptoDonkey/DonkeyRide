import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { DomainProvider } from './context/DomainContext';
import { IdentityProvider } from './context/IdentityContext';
import { TaskProvider } from './context/TaskContext';
import './index.css';

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

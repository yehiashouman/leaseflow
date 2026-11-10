import { createQueryClient } from './query-client';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './auth';
import './styles.css';
import { api } from './api';
import { previewMode } from './session';
const client = createQueryClient();
async function start() {
  if (previewMode) {
    const { previewAdapter } = await import('./preview/adapter');
    api.defaults.adapter = previewAdapter;
  }
  const Router = previewMode ? HashRouter : BrowserRouter;
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={client}>
        <Router>
          <AuthProvider>
            <App />
          </AuthProvider>
        </Router>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}
void start();

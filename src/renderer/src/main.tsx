import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { QuickCaptureRoot } from './features/quickCapture/QuickCaptureApp';
import { queryClient } from './lib/query-client';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

// The capture popup loads the same HTML bundle but with ?mode=capture in the
// URL. Render the lightweight capture UI instead of the full three-pane app.
const isCaptureMode =
  new URLSearchParams(window.location.search).get('mode') === 'capture';

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    {isCaptureMode ? (
      <QuickCaptureRoot />
    ) : (
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    )}
  </React.StrictMode>,
);

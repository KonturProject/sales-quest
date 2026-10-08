import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { getViewer } from './app/viewer.ts';
import './index.css';

// Start loading the data before the first render; this also takes the phrase out of the link (SEC-7).
getViewer();

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing in index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

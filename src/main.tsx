import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './App.css';
import App from './App';
import { applyThemeVars } from './theme';

// Install the Night Owl palette on :root before the first paint so App.css
// resolves its var() references against real values rather than its static
// fallbacks. html/body carry a hardcoded base tone in CSS as well, which
// covers the brief window before this module runs.
applyThemeVars();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);

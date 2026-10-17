import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import './theme-v97.css';
import './theme-v98.css';
import './theme-v99.css';
import './theme-v100.css';
import './theme-v101.css';
import './theme-v102.css';
import './theme-v104.css';
import './theme-v105.css';
import './theme-v106.css';
import './theme-v108.css';
import './theme-v109.css';
import './theme-v110.css';
import './theme-v112.css';
import './theme-v113.css';
import './theme-v114.css';
import './theme-v115.css';
import './theme-v116.css';
import './theme-v117.css';
import './theme-v118.css';
import './theme-v119.css';
import './theme-v120.css';
import './theme-v121.css';
import './theme-v122.css';
import './theme-v123.css';
import './theme-v124.css';
import './theme-v125.css';
import './theme-v126.css';
import './theme-v127.css';
import './theme-v128.css';
import './theme-v129.css';
import './theme-v130.css';
import './theme-v131.css';
import './theme-v132.css';
import './theme-v133.css';
import './theme-v134.css';
import './theme-v135.css';
import { LanguageProvider } from './i18n';
import DialogFocusManager from './components/DialogFocusManager';
import { initializeThemePreferences } from './theme';

initializeThemePreferences();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <DialogFocusManager />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>
);


if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((registration) => registration.update()).catch(() => undefined);
  });
}

import './theme-v136.css';

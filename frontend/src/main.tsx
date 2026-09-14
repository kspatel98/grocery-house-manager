import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import { LanguageProvider } from './i18n';
import DialogFocusManager from './components/DialogFocusManager';

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
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

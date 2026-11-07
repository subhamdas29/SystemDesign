import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@design/index.css';
import { useGraphStore } from '@store';

if (typeof window !== 'undefined') {
  (window as unknown as { __graphStore: typeof useGraphStore }).__graphStore = useGraphStore;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

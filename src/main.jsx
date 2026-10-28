import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Required root element #root was not found');
}

// Auth state is mounted above future route screens. The route table is added in Step 3.12.
createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider />
    </BrowserRouter>
  </StrictMode>,
);

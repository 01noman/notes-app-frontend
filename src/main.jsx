import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Required root element #root was not found');
}

// Step 3.1 intentionally renders no UI. Pages and styles are added in later atomic steps.
createRoot(rootElement).render(<StrictMode />);

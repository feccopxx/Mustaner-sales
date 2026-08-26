import { StrictMode } from 'react'; import { createRoot } from 'react-dom/client'; import App from './App.js'; import './styles.css'; import './font.css'; import './pdf-import.css'; import './pdf-import-focused.css';
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);

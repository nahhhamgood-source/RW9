import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';

import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// MediaPipe / TFLite WebAssembly routes C++ informational stderr lines (e.g.
// "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.") to console.error.
// Downgrade those benign INFO lines to console.info while preserving real errors.
if (typeof window !== 'undefined' && !(window as unknown as Record<string, boolean>).__ascendConsoleFilterInstalled) {
  (window as unknown as Record<string, boolean>).__ascendConsoleFilterInstalled = true;
  const origConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const combined = args
      .map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : ''))
      .join(' ');
    if (
      combined.includes('INFO: Created TensorFlow Lite XNNPACK delegate') ||
      combined.includes('Created TensorFlow Lite XNNPACK delegate for CPU') ||
      combined.includes('All log messages before absl::InitializeLog()') ||
      /(^|\s)(I|W)\d{4}\s.*inference_feedback_manager/.test(combined)
    ) {
      console.info(...args);
      return;
    }
    origConsoleError(...args);
  };
}

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(<App />);

import React from 'react'
import ReactDOM from 'react-dom/client'
import ModeApp from './ModeApp.tsx'
import './index.css'

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error("Failed to find the root element. Ensure index.html has <div id='root'></div>");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ModeApp />
  </React.StrictMode>,
)
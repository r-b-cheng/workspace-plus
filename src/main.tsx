/// <reference types="vite/client" />

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { WorkspaceShell } from './app/workspace-shell';
import './styles/app.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <WorkspaceShell />
  </StrictMode>,
);

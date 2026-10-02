// Entry point for `npm start` (Hostinger Node.js app). The backend logs which database it uses
// ("[Database] Using …") and what to fix when it cannot connect; GET /api/health shows the same.
console.log('Starting ResumeStudio unified server...');

import('./backend/dist/main.js')
  .then(() => console.log('ResumeStudio backend bootstrap initiated'))
  .catch((err) => {
    console.error('Failed to start ResumeStudio server:', err);
  });

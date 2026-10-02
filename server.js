console.log('Starting ResumeStudio unified server...');
console.log('ENV SUPABASE_URL:', process.env.SUPABASE_URL || 'NOT SET');
console.log('ENV DATABASE_HOST:', process.env.DATABASE_HOST || 'NOT SET');
console.log('ENV DATABASE_USER:', process.env.DATABASE_USER || 'NOT SET');
console.log('ENV DATABASE_PASSWORD length:', (process.env.DATABASE_PASSWORD || '').length);
console.log('ENV DATABASE_PASSWORD is default local:', process.env.DATABASE_PASSWORD === 'resumestudio_secret');
console.log('ENV DATABASE_URL configured:', Boolean(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('[YOUR-PASSWORD]')));

import('./backend/dist/main.js')
  .then(() => console.log('ResumeStudio backend bootstrap initiated'))
  .catch((err) => {
    console.error('Failed to start ResumeStudio server:', err);
  });

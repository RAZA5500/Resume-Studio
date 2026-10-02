console.log('Starting ResumeStudio unified server...');
import('./backend/dist/main.js')
  .then(() => console.log('ResumeStudio backend bootstrap initiated'))
  .catch((err) => {
    console.error('Failed to start ResumeStudio server:', err);
    process.exit(1);
  });

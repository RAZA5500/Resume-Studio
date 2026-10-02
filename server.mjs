// Entry point for Hostinger Node.js Web App / CloudLinux Passenger
import('./backend/dist/main.js').catch((err) => {
  console.error('Failed to start ResumeStudio server:', err);
  process.exit(1);
});

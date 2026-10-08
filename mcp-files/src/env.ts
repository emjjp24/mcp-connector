// Load settings from the .env file (if there is one). Variables already set in the
// environment win, so pm2 or the tests can override the file.
try {
  process.loadEnvFile();
} catch {
  // no .env file - that's fine
}

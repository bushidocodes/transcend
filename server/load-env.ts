// Load environment variables from a .env file if present, using Node's built-in loader
// (replaces the `dotenv` dep). Like dotenv, this does not override variables already set
// in the environment, so an inline `DATABASE_URL=… node server/index.ts` still wins.
//
// Own module (rather than inline at the top of server/index.ts) because ESM imports are
// hoisted: the db module reads DATABASE_URL at import time, so the only way to run this
// first is to BE the first import.
try {
  process.loadEnvFile();
} catch {
  // No .env file — rely on the real environment.
}

export {};

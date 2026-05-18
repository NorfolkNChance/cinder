/**
 * Drizzle Kit configuration.
 *
 * Phase 1 note: @journeyapps/sqlcipher uses the node-sqlite3 async API.
 * At runtime, Drizzle will be wired via `drizzle-orm/sqlite-proxy` with a
 * promisified sqlcipher adapter — see src/main/db/index.ts.
 *
 * Drizzle Kit (for generating/running migrations) works against the schema
 * definition only and does not need a live DB connection at codegen time.
 */
export default {
  schema: './src/main/db/schema.ts',
  out: './src/main/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    // Migrations are applied at runtime through initDb(); this URL is only
    // used if you run `drizzle-kit studio` against a local dev copy.
    url: './dev.db',
  },
};

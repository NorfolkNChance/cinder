/**
 * @journeyapps/sqlcipher is a drop-in replacement for node-sqlite3 with
 * SQLCipher compiled in. Its public API is identical to sqlite3, so we
 * re-export the sqlite3 types under the sqlcipher module name.
 */
declare module '@journeyapps/sqlcipher' {
  export * from 'sqlite3';
  export { default } from 'sqlite3';
}

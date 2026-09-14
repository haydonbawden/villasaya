/**
 * Takes a consistent snapshot of the database while the app keeps serving.
 *
 *   node server/dist/scripts/backup.js /data/backups/villa-2026-09-14.sqlite
 *
 * Copying the SQLite file directly — with `cp`, or by tarring the volume — is
 * not safe on a running database. Pages are written out of order and the
 * write-ahead log lives in a separate file, so a plain copy can capture a torn
 * state that will not open. `VACUUM INTO` asks SQLite itself to write a clean
 * copy at a single point in time, which is the difference between an archive
 * and a file that merely looks like one.
 *
 * The result is a normal SQLite database: open it, or restore it by stopping
 * the stack and moving it into place.
 */
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from '../config.ts';
import { getDb, closeDb } from '../db/index.ts';

function main(): void {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: backup.js <destination.sqlite>');
    process.exit(2);
  }

  const destination = resolve(target);
  if (existsSync(destination)) {
    // VACUUM INTO refuses to overwrite, and failing here says why.
    console.error(`Refusing to overwrite an existing file: ${destination}`);
    process.exit(1);
  }
  mkdirSync(dirname(destination), { recursive: true });

  const started = Date.now();
  const db = getDb();
  // The path cannot be a bound parameter in VACUUM INTO, so it is quoted by
  // doubling any single quotes — the only escape SQLite string literals have.
  db.exec(`VACUUM INTO '${destination.replace(/'/g, "''")}'`);
  closeDb();

  const { size } = statSync(destination);
  const mb = (size / 1024 / 1024).toFixed(1);
  console.log(`Backed up ${config.databasePath} -> ${destination} (${mb} MB, ${Date.now() - started}ms)`);
}

main();

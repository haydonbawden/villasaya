/**
 * `tsc` only emits JavaScript, so the .sql migration files have to be copied
 * into dist/ alongside it — without them the built server cannot boot.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const from = path.join(root, 'src', 'db', 'migrations');
const to = path.join(root, 'dist', 'db', 'migrations');

fs.mkdirSync(to, { recursive: true });
const files = fs.readdirSync(from).filter((file) => file.endsWith('.sql'));
for (const file of files) {
  fs.copyFileSync(path.join(from, file), path.join(to, file));
}
console.log(`[build] copied ${files.length} migration${files.length === 1 ? '' : 's'} to dist/db/migrations`);

import { mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.argv[2] ?? `/private/tmp/kairos-file-share-${Date.now()}`);
// Require a new directory; never erase an existing output or copy unrelated repository files.
await mkdir(output);
for (const name of ['index.html', 'style.css', 'app.mjs', 'plan.mjs', 'ruler.mjs', 'artwork.mjs', 'workout.mjs', 'share.mjs', 'file-address.mjs', '_headers', 'NOTICE.txt', 'assets/app-icon.svg', 'open/index.html', 'open/test.mjs', 'open/worker.mjs', 'assets/direct-open.workout']) {
  const target = join(output, name);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(root, 'web', name), target);
}
console.log(`Static Pages upload directory: ${output}`);

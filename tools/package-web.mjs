import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.argv[2] ?? `/private/tmp/kairos-file-share-${Date.now()}`);
// Require a new directory; never erase an existing output or copy unrelated repository files.
await mkdir(output);
for (const name of ['style.css', 'workbench.css', 'assets/fuel-objects.svg', 'themes.css', 'app.mjs', 'sheets.mjs', 'navigation.mjs', 'focus.mjs', 'gels.mjs', 'gel-editor.mjs', 'calculator.mjs', 'fueling.css', 'components.css', 'fueling-model.mjs', 'fueling-view.mjs', 'generation.mjs', 'generator.mjs', 'plan.mjs', 'library.mjs', 'plan-controls.mjs', 'profile.mjs', 'profile-editor.mjs', 'routes.mjs', 'elevation-chart.mjs', 'igpsport.mjs', 'route-providers.mjs', 'route-session.mjs', 'route-picker.mjs', 'qr.mjs', 'vendor/qrcodegen.mjs', 'vendor/d3-zoom.mjs', 'vendor/d3-zoom.LICENSE.txt', 'theme-init.js', 'themes.mjs', 'ruler.mjs', 'ruler.css', 'terrain.mjs', 'haptics.mjs', 'artwork.mjs', 'workout.mjs', 'share.mjs', 'file-address.mjs', '_headers', 'NOTICE.txt', 'assets/app-icon.svg', 'open/index.html', 'open/test.mjs', 'open/worker.mjs', 'assets/direct-open.workout']) {
  const target = join(output, name);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(root, 'web', name), target);
}
// Ship the same shell at both public URLs, with the source styles in cascade order.
const shell = await readFile(join(root, 'web/index.html'), 'utf8');
const links = [...shell.matchAll(/^ *<link rel="stylesheet" href="\.\/([\w-]+\.css)">\n/gm)];
const styles = await Promise.all(links.map(([, name]) => readFile(join(root, 'web', name), 'utf8')));
await writeFile(join(output, 'app.css'), styles.join('\n'));
let entry = shell;
for (const [index, [tag]] of links.entries()) {
  entry = entry.replace(tag, index === 0 ? '    <link rel="stylesheet" href="./app.css">\n' : '');
}
for (const name of ['index.html', 'calculator.html']) await writeFile(join(output, name), entry);
console.log(`Static Pages upload directory: ${output}`);

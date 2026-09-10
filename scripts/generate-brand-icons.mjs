// Run from the repository root: node scripts/generate-brand-icons.mjs
// Uses the existing Next.js sharp dependency; the approved SVG is the only artwork source.
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const source = await readFile('public/brand/doorgo-mark.svg');
const render = (size) => sharp(source, { density: 384 }).resize(size, size);

await render(32).png().toFile('public/brand/doorgo-favicon-32.png');
for (const size of [192, 512]) {
  await render(size).flatten({ background: '#ffffff' }).png().toFile(`public/brand/doorgo-app-${size}.png`);
}
await render(180).flatten({ background: '#ffffff' }).png().toFile('public/brand/doorgo-apple-touch-180.png');

// At 70% scale the mark's outer corners lie inside the central 40%-radius safe circle.
const insetMark = await render(358).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#ffffff' } })
  .composite([{ input: insetMark, left: 77, top: 77 }]).png().toFile('public/brand/doorgo-maskable-512.png');

// ICO directory containing lossless PNG images at standard browser favicon sizes.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((size) => render(size).png().toBuffer()));
const directory = Buffer.alloc(6 + 16 * images.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(images.length, 4);
let offset = directory.length;
images.forEach((bytes, index) => {
  const entry = 6 + index * 16;
  directory[entry] = sizes[index];
  directory[entry + 1] = sizes[index];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(bytes.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += bytes.length;
});
await writeFile('app/favicon.ico', Buffer.concat([directory, ...images]));

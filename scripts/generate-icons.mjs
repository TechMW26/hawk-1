#!/usr/bin/env node
/**
 * Generate PWA PNG icons from the HAWK favicon SVG.
 * Uses sharp (npm install --save-dev sharp) for SVG → PNG conversion.
 *
 * Run: node scripts/generate-icons.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SVG_PATH = resolve(ROOT, 'public', 'favicon.svg')
const ICONS_DIR = resolve(ROOT, 'public', 'icons')

async function main() {
  let sharp
  try {
    sharp = (await import('sharp')).default
  } catch {
    console.error(
      'sharp is not installed. Run: npm install --save-dev sharp\n' +
      'Then re-run this script.'
    )
    process.exit(1)
  }

  const svgBuffer = readFileSync(SVG_PATH)

  // Ensure icons directory exists
  const { mkdirSync } = await import('node:fs')
  mkdirSync(ICONS_DIR, { recursive: true })

  const sizes = [
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
  ]

  for (const { name, size } of sizes) {
    const outPath = resolve(ICONS_DIR, name)
    await sharp(svgBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(outPath)
    console.log(`✓ ${name} (${size}×${size})`)
  }

  console.log('\nAll PWA icons generated.')
}

main().catch((err) => {
  console.error('Icon generation failed:', err)
  process.exit(1)
})

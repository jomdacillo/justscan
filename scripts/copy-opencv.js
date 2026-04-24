/**
 * Copies opencv.js from @techstark/opencv-js into public/ so Vite serves
 * it as a static asset from the same origin as the rest of the app.
 *
 * Runs automatically on `npm install` (postinstall) and before every
 * `npm run dev` / `npm run build`.
 *
 * This is the safety net for the runtime: if this file is in public/,
 * the loader will find it at /opencv.js — no CDN, no CORS, no third
 * parties. Cloudflare Pages will cache it on their edge for free.
 */

import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

const src = join(projectRoot, 'node_modules', '@techstark', 'opencv-js', 'dist', 'opencv.js')
const destDir = join(projectRoot, 'public')
const dest = join(destDir, 'opencv.js')

if (!existsSync(src)) {
  console.warn(
    '[copy-opencv] Source not found at',
    src,
    '\n  Run `npm install` first.',
  )
  process.exit(0) // soft-fail so npm install itself doesn't break
}

if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true })
}

// Skip the copy if the destination is already up to date
if (existsSync(dest)) {
  const srcStat = statSync(src)
  const destStat = statSync(dest)
  if (srcStat.size === destStat.size && srcStat.mtimeMs <= destStat.mtimeMs) {
    process.exit(0)
  }
}

copyFileSync(src, dest)
const sizeMB = (statSync(dest).size / 1024 / 1024).toFixed(2)
console.log(`[copy-opencv] Copied opencv.js (${sizeMB} MB) -> public/opencv.js`)

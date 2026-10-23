import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const { chromium } = createRequire(new URL('../server/package.json', import.meta.url))('playwright');
import { parseConfig } from '../server/dist/config.js';
import { StateStore } from '../server/dist/state.js';
import { createServer } from '../server/dist/server.js';
import { SignageStreamer } from '../server/dist/renderer/stream.js';

const output = await mkdtemp(join(tmpdir(), 'meural-signage-smoke-'));
const cfg = parseConfig({ stream: { hlsDir: output }, providers: {
  weather: { enabled: false }, spotify: { enabled: false }, entetsuBus: { enabled: false },
  trains: { enabled: false }, calendar: { enabled: false },
} });
const store = new StateStore(cfg);
const app = await createServer(cfg, store);
let browser;
let streamer;
try {
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  cfg.stream.url = `${address}/?demo=1`;
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(address);
  await page.waitForSelector('.weather');
  // Preserve DOM identity when an unrelated widget updates.
  await page.evaluate(() => { window.savedWeatherCard = document.querySelector('.weather'); });
  store.setSpotify({ status: 'ok', fetchedAt: new Date().toISOString(), isPlaying: false, track: null });
  await page.waitForFunction(() => !document.querySelector('.spotify .badge'));
  assert.equal(await page.evaluate(() => window.savedWeatherCard === document.querySelector('.weather')), true);
  await page.goto(`${address}/?demo=1`);
  await page.waitForSelector('.weather');
  await page.screenshot({ path: join(output, 'dashboard.png') });
  assert.deepEqual(errors, []);

  streamer = new SignageStreamer(cfg);
  await streamer.start();
  let manifest;
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    try { manifest = await readFile(join(output, 'live.m3u8'), 'utf8'); } catch { continue; }
    if (manifest.includes('.ts')) break;
  }
  assert.ok(manifest?.includes('#EXTINF:'));
  const segment = manifest.split('\n').find(line => line.endsWith('.ts'));
  const video = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', join(output, segment)], { encoding: 'utf8' })).streams[0];
  assert.equal(video.codec_name, 'h264');
  assert.equal(video.width, 1920);
  assert.equal(video.height, 1080);
  assert.equal(video.pix_fmt, 'yuv420p');
  assert.equal(video.r_frame_rate, '15/1');
  console.log(JSON.stringify({ address, screenshot: join(output, 'dashboard.png'), codec: video.codec_name, size: `${video.width}x${video.height}`, fps: video.r_frame_rate, domPreserved: true }));
  await streamer.stop();
  streamer = null;
  await new Promise(resolve => setTimeout(resolve, 3500));
  console.log('Clean shutdown completed without restarting the pipeline.');
} catch (error) {
  console.error('Smoke failure:', error);
  throw error;
} finally {
  await streamer?.stop();
  await browser?.close();
  await app.close();
  // Retain the screenshot for visual inspection, remove generated video.
  const { readdir } = await import('node:fs/promises');
  for (const name of await readdir(output)) if (name !== 'dashboard.png') await rm(join(output, name));
}

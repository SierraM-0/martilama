import satori from 'satori';
import { html } from 'satori-html';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';

const fraunces = fs.readFileSync('og/fonts/Fraunces-Static.ttf');
const mono = fs.readFileSync('og/fonts/JetBrainsMono-Medium.ttf');

// Mannaz badge, hard-coded colours. satori won't rasterize an SVG <img>, so we
// pre-render the SVG to PNG with resvg and embed that as a data URI instead.
const BADGE_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'>" +
  "<rect x='3' y='3' width='58' height='58' rx='18' fill='#b85c38'/>" +
  "<g fill='none' stroke='#faf8f5' stroke-width='5' stroke-linecap='round'>" +
  "<path d='M21 19 V45'/><path d='M43 19 V45'/><path d='M21 22 L43 34'/><path d='M43 22 L21 34'/>" +
  '</g></svg>';
const BADGE_PNG = new Resvg(BADGE_SVG, { fitTo: { mode: 'width', value: 112 } })
  .render()
  .asPng();
const BADGE = 'data:image/png;base64,' + BADGE_PNG.toString('base64');

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function renderCard({ title, subtitle, date }) {
  const markup = html(`
    <div style="display:flex;flex-direction:column;justify-content:space-between;width:1200px;height:630px;padding:72px;background-color:#faf8f5;color:#2b2722;">
      <div style="display:flex;align-items:center;">
        <img src="${BADGE}" style="width:56px;height:56px;" />
        <span style="margin-left:18px;font-family:'Mono';font-size:30px;color:#2b2722;letter-spacing:1px;">martilama</span>
      </div>
      <div style="display:flex;flex-direction:column;">
        <div style="display:flex;font-family:'Fraunces';font-size:72px;font-weight:600;line-height:1.07;color:#2b2722;">${esc(title)}</div>
        ${
          subtitle
            ? `<div style="display:flex;font-family:'Fraunces';font-size:30px;color:#6b6358;margin-top:28px;line-height:1.35;">${esc(subtitle)}</div>`
            : ''
        }
      </div>
      <div style="display:flex;justify-content:space-between;font-family:'Mono';font-size:24px;color:#6b6358;">
        <span style="display:flex;">${date ? esc(date) : ' '}</span>
        <span style="display:flex;">martilama.com</span>
      </div>
    </div>
  `);

  const svg = await satori(markup, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Fraunces', data: fraunces, weight: 600, style: 'normal' },
      { name: 'Mono', data: mono, weight: 500, style: 'normal' },
    ],
  });

  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}

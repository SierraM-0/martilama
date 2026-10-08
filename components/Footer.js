import { html, raw } from '../lib/html.js';

const RUNE = html`<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
  <g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round">
    <path d="M21 16 V48" /><path d="M43 16 V48" />
    <path d="M21 20 L43 34" /><path d="M43 20 L21 34" />
  </g></svg>`;

export const Footer = () => {
  const now = new Date();
  const year = now.getFullYear();
  const updated = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return html`
    <footer class="site-footer">
      <span class="coloph-rune" tabindex="0" role="img"
            aria-label="Mannaz — the elder-futhark rune for self, and mankind">
        <span class="rune-tip" aria-hidden="true"><b>Mannaz</b> · self, mankind</span>
        ${raw(RUNE)}
      </span>
      <div class="coloph-text">
        <p class="coloph-body">Set in <span class="hi">Fraunces</span> &amp; <span class="hi">Newsreader</span>.</p>
        <p class="coloph-body">Claude Coded in <span class="hi">Node</span> — no framework, no trackers, no cookies.</p>
        <p class="coloph-meta"><span>© ${year} martilama</span> · <span>updated ${updated}</span> ·
          <a href="https://github.com/SierraM-0" target="_blank" rel="noopener noreferrer">github</a><span id="report-slot" hidden> ·
          <button type="button" class="report-link" id="report-link">report a problem</button></span></p>
      </div>
      <dialog id="report-dialog" class="report-dialog rr-block" aria-labelledby="report-title">
        <form method="dialog" id="report-form">
          <h2 id="report-title">Report a problem</h2>
          <p>This sends a replay of about your last 3 minutes on this site, and the browser console log, to Marti.</p>
          <label for="report-note">What went wrong? (optional)</label>
          <textarea id="report-note" maxlength="1000" rows="4"></textarea>
          <p class="report-status" id="report-status" role="status" aria-live="polite"></p>
          <div class="report-actions">
            <button type="button" id="report-cancel">Cancel</button>
            <button type="submit" class="primary" id="report-send">Send</button>
          </div>
        </form>
      </dialog>
    </footer>`;
};

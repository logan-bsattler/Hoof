// DOM-side UI: tool dock, steps checklist, toasts, and modal cards.

import { TOOLS, TOOL_ORDER } from './tools.js';
import { STEPS, DONE_TIP, stepTip } from './steps.js';
import { drawToolIcon } from './toolart.js';

const $ = (id) => document.getElementById(id);

const TOAST_PRI = { info: 0, good: 1, warn: 2 };
const TOAST_MIN = 1200;   // ms a toast stays up before another may replace it
const TOAST_STALE = 4000; // ms a queued toast may wait before it's dropped

export class UI {
  constructor({ onTool, onRelease, onRead, onToggleGuides, onToggleSound, onToggleLefty }) {
    this.toolButtons = {};
    const dock = $('tools');
    for (const id of TOOL_ORDER) {
      const t = TOOLS[id];
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.tool = id;
      b.title = `${t.name} (${t.key})`;
      b.innerHTML = `<canvas class="icon" aria-hidden="true"></canvas><span class="name">${t.name}</span><kbd>${t.key}</kbd>`;
      b.addEventListener('click', () => {
        onTool(id);
        // Phones hide the hint line to fit two rows of tools: show it briefly instead.
        if (!$('toolInfo').offsetParent) this.toast(`${t.name} · ${t.hint}`, 'info', 2200);
      });
      dock.appendChild(b);
      this.toolButtons[id] = b;
    }

    this.drawIcons();
    // Redraw sharp when the device pixel ratio changes (zoom, moving to another screen).
    const watchDpr = () => {
      matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => { this.drawIcons(); watchDpr(); }, { once: true });
    };
    watchDpr();
    // The icon's CSS size changes with the layout breakpoint.
    addEventListener('resize', () => this.drawIcons());

    const list = $('stepsList');
    this.stepItems = STEPS.map((s) => {
      const li = document.createElement('li');
      li.textContent = s.label;
      list.appendChild(li);
      return li;
    });

    $('btnRelease').addEventListener('click', onRelease);
    $('btnRead').addEventListener('click', onRead);
    $('btnReadBar').addEventListener('click', onRead);
    $('btnReleaseBar').addEventListener('click', onRelease);
    $('btnGuides').addEventListener('click', onToggleGuides);
    $('btnSound').addEventListener('click', onToggleSound);
    $('btnLefty').addEventListener('click', onToggleLefty);
    $('btnSteps').addEventListener('click', () => document.body.classList.toggle('steps-open'));
    // The step bar clamps its tip; a tap on the text shows the full card.
    $('stepBar').firstElementChild.addEventListener('click', () => document.body.classList.add('steps-open'));
    $('stepsPanel').addEventListener('click', (e) => {
      if (e.target === $('stepsPanel')) document.body.classList.remove('steps-open');
    });
    this.toastTimer = null;
    this.toastWait = null;
    this.toastCur = null;   // { msg, kind, ms, pri, at }
    this.toastQueue = [];
  }

  // Paint each dock icon from the in-hand tool art, at the icon's CSS size x DPR.
  drawIcons() {
    const dpr = devicePixelRatio || 1;
    for (const [id, b] of Object.entries(this.toolButtons)) {
      const cv = b.querySelector('canvas.icon');
      const px = Math.round((cv.clientWidth || 28) * dpr);
      if (cv.width === px) continue;
      cv.width = cv.height = px;
      drawToolIcon(cv.getContext('2d'), id, px);
    }
  }

  setTool(id) {
    for (const [k, b] of Object.entries(this.toolButtons)) b.classList.toggle('active', k === id);
    $('toolInfo').innerHTML = `<strong>${TOOLS[id].name}</strong> · ${TOOLS[id].hint}`;
  }

  // "Commit read" shows once the testers have found something and until the read is made.
  setReadable(on) {
    $('btnRead').hidden = !on;
    $('btnReadBar').hidden = !on;
    $('btnReleaseBar').hidden = on;
  }

  setToggle(id, on) {
    $(id).classList.toggle('on', on);
    $(id).setAttribute('aria-pressed', on);
  }

  setSteps({ status, current }, caseDef) {
    status.forEach((s, k) => {
      const li = this.stepItems[k];
      li.classList.toggle('done', s.done);
      li.classList.toggle('current', k === current);
    });
    const tip = current < 0 ? DONE_TIP : stepTip(STEPS[current], caseDef);
    const label = current < 0 ? 'All steps done' : STEPS[current].label;
    $('stepTip').textContent = tip;
    if (!this.coaching) {
      $('stepBarLabel').textContent = label;
      $('stepBarTip').textContent = tip;
    }
    const hintTool = current < 0 ? null : STEPS[current].tool;
    for (const [k, b] of Object.entries(this.toolButtons)) b.classList.toggle('suggested', k === hintTool);
  }

  // Guided-run coach card: beat n of N, what to do, and a progress bar.
  setCoach(t) {
    const el = $('coach');
    const prog = $('stepBarProg');
    this.coaching = !!t;
    if (!t) { el.hidden = true; prog.hidden = true; return; }
    el.hidden = false;
    const b = t.beat;
    const n = t.beats.length;
    if (!b) {
      $('coachCount').textContent = 'Guided trim · done';
      $('coachTitle').textContent = 'That’s a good foot';
      $('coachText').textContent = 'Every step done. Hit “Release the cow” and watch her walk off.';
      $('coachBar').style.width = '100%';
      prog.hidden = true;
      return;
    }
    const pct = `${Math.round((b.measure ? t.progress : 0) * 100)}%`;
    $('coachCount').textContent = `Guided trim · ${t.index + 1} of ${n} · ${TOOLS[b.tool].name}`;
    $('coachTitle').textContent = b.title;
    $('coachText').textContent = b.text;
    $('coachBar').style.width = pct;
    $('coachBar').parentElement.hidden = !b.measure;
    prog.firstElementChild.style.width = pct;
    prog.hidden = !b.measure;
    // Narrow screens hide the panel: the step bar carries the coaching instead.
    $('stepBarLabel').textContent = `${t.index + 1}/${n} · ${b.title}`;
    $('stepBarTip').textContent = b.text;
  }

  // One toast at a time. Each stays up at least TOAST_MIN, a newer one of equal or higher
  // priority replaces it after that, and a lower one waits its turn (warn > good > info).
  toast(msg, kind = 'info', ms = 2800) {
    const cur = this.toastCur;
    // The same message again just stays up longer; its TOAST_MIN clock isn't restarted.
    if (cur && cur.msg === msg) { this.showToast(cur, cur.at, ms); return; }
    this.toastQueue = (this.toastQueue ?? []).filter((q) => q.msg !== msg);
    this.toastQueue.push({ msg, kind, ms, pri: TOAST_PRI[kind] ?? 0, born: performance.now() });
    // Keep it short: stale tips are worse than none.
    if (this.toastQueue.length > 3) this.toastQueue.shift();
    this.pumpToast();
  }

  pumpToast() {
    clearTimeout(this.toastWait);
    const now = performance.now();
    this.toastQueue = (this.toastQueue ?? []).filter((q) => now - q.born < TOAST_STALE);
    if (!this.toastQueue.length) return;
    // Highest priority first; the newest wins a tie.
    const next = this.toastQueue.reduce((a, b) => (b.pri >= a.pri ? b : a));
    const cur = this.toastCur;
    if (cur) {
      if (next.pri < cur.pri) return; // shown when the current one ends
      const left = TOAST_MIN - (now - cur.at);
      if (left > 0) { this.toastWait = setTimeout(() => this.pumpToast(), left); return; }
    }
    this.toastQueue = this.toastQueue.filter((q) => q !== next);
    this.showToast(next, now);
  }

  // Show `t` (up since `at`) for `ms` more, never less than its TOAST_MIN.
  showToast(t, at, ms = t.ms) {
    const el = $('toast');
    el.textContent = t.msg;
    el.className = `show ${t.kind}`;
    this.toastCur = { ...t, at };
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      el.className = '';
      this.toastCur = null;
      // Let the fade finish before the next one comes up.
      this.toastWait = setTimeout(() => this.pumpToast(), 220);
    }, Math.max(TOAST_MIN - (performance.now() - at), ms));
  }

  // Show a modal card; resolves with the id of the button pressed.
  modal(html, buttons, { dismissible = false } = {}) {
    return new Promise((resolve) => {
      const card = $('modalCard');
      card.innerHTML = html;
      const row = document.createElement('div');
      row.className = 'buttons';
      for (const b of buttons) {
        const el = document.createElement('button');
        el.textContent = b.label;
        el.className = b.primary ? 'primary' : '';
        el.addEventListener('click', () => { this.closeModal(); resolve(b.id); });
        row.appendChild(el);
      }
      card.appendChild(row);
      $('modal').classList.remove('hidden');
      $('modal').onclick = dismissible ? (e) => {
        if (e.target === $('modal')) { this.closeModal(); resolve(null); }
      } : null;
      row.querySelector('button')?.focus();
    });
  }

  closeModal() { $('modal').classList.add('hidden'); }
}

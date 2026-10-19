// DOM-side UI: tool dock, steps checklist, toasts, and modal cards.

import { TOOLS, TOOL_ORDER } from './tools.js';
import { DONE_TIP, stepLabel, stepTip, stepsFor } from './steps.js';
import { drawToolIcon } from './toolart.js';

const $ = (id) => document.getElementById(id);

const TOAST_PRI = { info: 0, good: 1, warn: 2 };
const TOAST_MIN = 1200;   // ms a toast stays up before another may replace it
const TOAST_STALE = 4000; // ms a queued toast may wait before it's dropped

export class UI {
  constructor({ onTool, onRelease, onCall, onRead, onToggleGuides, onToggleSound, onToggleLefty }) {
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

    this.stepItems = [];

    $('btnRelease').addEventListener('click', onRelease);
    $('btnRead').addEventListener('click', onRead);
    $('btnReadBar').addEventListener('click', onRead);
    $('btnReleaseBar').addEventListener('click', onRelease);
    $('btnCall').addEventListener('click', onCall);
    $('btnCallBar').addEventListener('click', onCall);
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
    // Where the finger (or mouse) last was over the play area: a toast keeps clear of it.
    this.pointerY = null;
    const track = (e) => { this.pointerY = e.clientY; };
    $('canvasWrap').addEventListener('pointerdown', track, { passive: true });
    $('canvasWrap').addEventListener('pointermove', track, { passive: true });
    this.toastCur = null;   // { msg, kind, ms, pri, at }
    this.toastQueue = [];
  }

  // Paint each dock icon from the in-hand tool art, at the icon's CSS size x DPR.
  drawIcons() {
    const dpr = devicePixelRatio || 1;
    this.iconKind ??= {};
    this.iconDrawn ??= {};
    for (const [id, b] of Object.entries(this.toolButtons)) {
      const cv = b.querySelector('canvas.icon');
      const px = Math.round((cv.clientWidth || 28) * dpr);
      const kind = this.iconKind[id] ?? '';
      if (cv.width === px && this.iconDrawn[id] === kind) continue;
      cv.width = cv.height = px;
      drawToolIcon(cv.getContext('2d'), id, px, kind);
      this.iconDrawn[id] = kind;
    }
  }

  // Show a variant on a tool's dock icon (the wood block).
  setIconKind(id, kind) {
    (this.iconKind ??= {})[id] = kind;
    this.drawIcons();
  }

  // The knife's edge on a sand farm (WP12.4): a pip on its button, green when sharp, amber as it
  // dulls, red once it wants changing. null hides it (no sand, no wear).
  setWear(w) {
    const b = this.toolButtons.knife;
    let pip = b.querySelector('.wear');
    if (w == null) { if (pip) pip.hidden = true; return; }
    if (!pip) { pip = document.createElement('i'); pip.className = 'wear'; b.appendChild(pip); }
    pip.hidden = false;
    pip.dataset.edge = w > 0.6 ? 'dull' : w > 0.3 ? 'worn' : 'sharp';
    pip.title = w > 0.6 ? 'Blunt: tap the knife again for a fresh one' : w > 0.3 ? 'Losing its edge' : 'Sharp';
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

  // hintTool: the tool button to flag with a dot (null: none, e.g. with the guides off).
  setSteps({ status, current }, caseDef, hintTool = null) {
    const steps = stepsFor(caseDef);
    // Rebuild the checklist when the case brings a different step list.
    if (this.stepsOf !== steps.map((s) => s.id).join()) {
      this.stepsOf = steps.map((s) => s.id).join();
      $('stepsList').replaceChildren(...(this.stepItems = steps.map((s) => {
        const li = document.createElement('li');
        li.textContent = stepLabel(s, caseDef);
        return li;
      })));
    }
    status.forEach((s, k) => {
      const li = this.stepItems[k];
      li.classList.toggle('done', s.done);
      li.classList.toggle('current', k === current);
    });
    const tip = current < 0 ? DONE_TIP : stepTip(steps[current], caseDef);
    const label = current < 0 ? 'All steps done' : stepLabel(steps[current], caseDef);
    $('stepTip').textContent = tip;
    if (!this.coaching) {
      $('stepBarLabel').textContent = label;
      $('stepBarTip').textContent = tip;
    }
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
    // Bottom centre sits on the toe, right under the thumb on a phone (phone notes 2026-10-15).
    // Working the lower half of the foot, the toast goes up under the gauge instead. Placed
    // when it comes up and not moved after, so it doesn't jump about under a moving tool.
    const r = $('game').getBoundingClientRect();
    const top = this.pointerY != null && this.pointerY > r.top + r.height / 2;
    el.className = `show ${t.kind}${top ? ' top' : ''}`;
    this.toastCur = { ...t, at };
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      el.classList.remove('show'); // keeps its place while it fades
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

  // A loading bar on the open card while the foot gets ready (p: 0..1). Its buttons wait for it.
  setLoading(p) {
    const card = $('modalCard');
    const done = p >= 1;
    let bar = card.querySelector('.loadbar');
    if (!bar && !done) {
      bar = document.createElement('div');
      bar.className = 'loadbar';
      bar.setAttribute('role', 'progressbar');
      bar.innerHTML = '<span>Lifting her foot…</span><div class="track"><i></i></div>';
      const row = card.querySelector('.buttons');
      if (row) row.before(bar); else card.append(bar);
    }
    if (bar) {
      bar.setAttribute('aria-valuenow', String(Math.round(p * 100)));
      bar.querySelector('i').style.width = `${Math.round(p * 100)}%`;
      if (done) bar.remove();
    }
    const buttons = card.querySelectorAll('.buttons button');
    const was = buttons[0]?.disabled;
    buttons.forEach((b) => { b.disabled = !done; });
    if (done && was) buttons[0].focus();
  }
}

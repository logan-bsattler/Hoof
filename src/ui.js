// DOM-side UI: tool dock, steps checklist, toasts, and modal cards.

import { TOOLS, TOOL_ORDER } from './tools.js';
import { STEPS, DONE_TIP } from './steps.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor({ onTool, onRelease, onToggleGuides, onToggleSound }) {
    this.toolButtons = {};
    const dock = $('tools');
    for (const id of TOOL_ORDER) {
      const t = TOOLS[id];
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.tool = id;
      b.title = `${t.name} (${t.key})`;
      b.innerHTML = `<span class="icon" aria-hidden="true">${t.icon}</span><span class="name">${t.name}</span><kbd>${t.key}</kbd>`;
      b.addEventListener('click', () => onTool(id));
      dock.appendChild(b);
      this.toolButtons[id] = b;
    }

    const list = $('stepsList');
    this.stepItems = STEPS.map((s) => {
      const li = document.createElement('li');
      li.textContent = s.label;
      list.appendChild(li);
      return li;
    });

    $('btnRelease').addEventListener('click', onRelease);
    $('btnReleaseBar').addEventListener('click', onRelease);
    $('btnGuides').addEventListener('click', onToggleGuides);
    $('btnSound').addEventListener('click', onToggleSound);
    $('btnSteps').addEventListener('click', () => document.body.classList.toggle('steps-open'));
    $('stepsPanel').addEventListener('click', (e) => {
      if (e.target === $('stepsPanel')) document.body.classList.remove('steps-open');
    });
    this.toastTimer = null;
  }

  setTool(id) {
    for (const [k, b] of Object.entries(this.toolButtons)) b.classList.toggle('active', k === id);
    $('toolInfo').innerHTML = `<strong>${TOOLS[id].name}</strong> · ${TOOLS[id].hint}`;
  }

  setToggle(id, on) {
    $(id).classList.toggle('on', on);
    $(id).setAttribute('aria-pressed', on);
  }

  setSteps({ status, current }) {
    status.forEach((s, k) => {
      const li = this.stepItems[k];
      li.classList.toggle('done', s.done);
      li.classList.toggle('current', k === current);
    });
    const tip = current < 0 ? DONE_TIP : STEPS[current].tip;
    const label = current < 0 ? 'All steps done' : STEPS[current].label;
    $('stepTip').textContent = tip;
    $('stepBarLabel').textContent = label;
    $('stepBarTip').textContent = tip;
    const hintTool = current < 0 ? null : STEPS[current].tool;
    for (const [k, b] of Object.entries(this.toolButtons)) b.classList.toggle('suggested', k === hintTool);
  }

  toast(msg, kind = 'info', ms = 2800) {
    const el = $('toast');
    el.textContent = msg;
    el.className = `show ${kind}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.className = ''; }, ms);
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

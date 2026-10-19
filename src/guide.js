// The field guide (WP11.2): a book of the tools, the conditions met on the road, and the trim.
// guideBook() is the data, pure so the tests can read it; Guide is the DOM panel over the game.
// A condition stays locked until a cow with it has been finished on the round (route history),
// and its page says only what the game itself says after that cow: never the decoys.

import { TOOLS, TOOL_ORDER } from './tools.js';
import { CONDITIONS, CALLS, FINDING } from './conditions.js';
import { FARMS, KIT } from './route.js';

// When to reach for each tool, and what goes wrong with it.
const TOOL_NOTES = {
  brush: ['First, every time. You can’t read a foot you can’t see.', 'A blade through muck is a cut you didn’t mean.'],
  probe: ['On anything that looks wrong once she’s clean: dark, red, lifted or raw.', 'Squeeze, then commit your read before you start opening things.'],
  nippers: ['The overgrown toe only, from the tip back to her toe length: shorter on a small cow, longer on a big one.', 'Too blunt for the sole, and a big bite can reach the trim line.'],
  grinder: ['Levelling each claw’s sole to about 7 mm, in smooth passes.', 'Not near a lesion or on a false sole: it tears. Linger in one spot and she bleeds.'],
  knife: ['Pull for the dish along the inner edge. Flick (a short, quick stroke) to open a cap and lift loose horn.', 'Flick the rim of an opened lesion, never the raw middle: a long carve there strips the ring she stands on. A tap prises off an old block.'],
  rasp: ['After the grinder, to true the sole before a block covers it.', 'Smoothing only: it won’t take a claw down.'],
  block: ['On the sound claw, so the sore one is off the floor.', 'Never on the sore claw, nor when both claws are sore.'],
  spray: ['Flushing an opened lesion, or soaking sore skin in the cleft.', 'Flush again after each round of paring: fresh cuts need it too.'],
  wrap: ['The very last thing, on a treated claw: pad first, then the wrap.', 'Not every lesion gets one: some heal best open to the air.'],
};

// The order the conditions are listed in, and what the guide calls each in plain words.
// `finding` names the FINDING entry the testers report; the two with none say it here.
export const GUIDE_CONDITIONS = {
  routine: { plain: 'A routine trim', look: 'nothing wrong under the muck', feel: 'firm everywhere you test',
    todo: 'The five-step trim and the loose heel horn. Nothing to open: leave firm marks alone.' },
  ulcer: { plain: 'Sole ulcer', finding: 'ulcer' },
  whiteline: { plain: 'White-line abscess', finding: 'whiteline' },
  puncture: { plain: 'Puncture', finding: 'foreign' },
  toenecrosis: { plain: 'Toe necrosis', finding: 'toenecrosis' },
  doublesole: { plain: 'Double sole', finding: 'doublesole' },
  twoclaw: { plain: 'Lesions on both claws', finding: 'twoclaw' },
  dd: { plain: 'Digital dermatitis', finding: 'dd' },
  footrot: { plain: 'Foot rot', finding: 'footrot' },
  dds: { plain: 'Deep sepsis', finding: 'dds' },
  thinsole: { plain: 'Thin soles', look: 'long toes over a pink, thin sole', feel: 'the sole gives under the testers',
    todo: 'Nip the toes back and flick off loose heel horn. No grinder and no dish: she has no sole to spare.' },
  nonfoot: { plain: 'Lame higher up the leg', look: 'a clean foot, the toe worn square from dragging', feel: 'firm everywhere you test',
    todo: 'Nothing in the foot to trim. The lameness is up the leg: send her to the vet.' },
};

// The trim the guided run teaches, in plain words.
export const TRIM_PAGE = [
  ['Clean and read', 'Brush the muck off, then test anything that looks wrong and commit your read.'],
  ['1 · The first claw', 'The inner claw on a hind foot, the outer on a front. Nip the long toe back to her toe length, then grind the sole to about 7 mm. A Holstein’s toe is about 7.5 cm; a small cow or a heifer’s nearer 7, a big cow’s nearer 8.'],
  ['2 · Match the other', 'Bring the other claw down to the same height. Level is the goal.'],
  ['3 · Dish both', 'Carve a shallow dish along the inner edge of each claw, out of the toe triangle. Then rasp.'],
  ['4 · Rest the sore claw', 'Open what needs opening, and block the sound claw so the sore one is off the floor.'],
  ['5 · Loose horn', 'Flick off loose horn at the heel. Then treat what needs it, and release her.'],
];

// The conditions whose sore outer hind claw turns her toe out (WP14.3, stance.js).
const TOE_OUT_GUIDE = new Set(['ulcer', 'whiteline', 'puncture', 'toenecrosis', 'dds']);

const cap = (s) => s[0].toUpperCase() + s.slice(1);

// The conditions met on the round so far: a cow with it was finished (any way off the line).
export const metConditions = (history) => new Set(history.map((h) => h.condition));

// The whole road has been worked once: the "show all" switch comes on.
export const roundDone = (route) => FARMS.every((f) => route.visits[f.id]);

// Every page of the guide. Locked condition pages carry no text from the game.
export function guideBook({ history = [], all = false, rep = 0 } = {}) {
  const met = metConditions(history);
  // Kit that reputation opens for a tool (WP17.3): what it does, and when, or that you have it.
  const kitNote = (id) => KIT.filter((k) => k.tool === id).map((k) => `${k.name}${rep >= k.rep ? '' : ` (from reputation ${k.rep})`}: ${k.text}`);
  const tools = TOOL_ORDER.map((id) => ({ id, name: TOOLS[id].name, key: TOOLS[id].key, hint: TOOLS[id].hint, notes: TOOL_NOTES[id], kit: kitNote(id) }));
  const conditions = Object.entries(GUIDE_CONDITIONS).map(([id, g]) => {
    if (!all && !met.has(id)) return { id, locked: true };
    const C = CONDITIONS[id], F = FINDING[g.finding] ?? {};
    return {
      id, locked: false, title: C.title, plain: g.plain,
      look: cap(g.look ?? F.look), feel: cap(g.feel ?? F.feel), todo: g.todo ?? F.diagnosedText,
      call: C.call ? CALLS[C.call].label : 'Release her',
      ...(id === 'whiteline' ? { burst: 'Sometimes it has broken out on its own: an old hole at the wall, dry and crusted, and little pus. Still pare the track open to the pocket so it stays clean, but don’t dig for pus that isn’t there.' } : {}),
      ...(TOE_OUT_GUIDE.has(id) ? { walkIn: 'On a hind foot with the outer claw sore, she toes out on the walk-in: that’s the outer claw talking.' } : {}),
      img: `assets/guide/${id}.png`,
    };
  });
  return { tools, conditions, trim: TRIM_PAGE };
}

// ------------------------------------------------------------------ the panel

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LOCK_MARK = `<svg class="guide-lock" viewBox="0 0 512 512" aria-hidden="true">
  <path d="M244 112 C200 96 120 104 104 176 C88 248 112 352 160 410 C190 446 230 446 244 434 Z" />
  <path d="M268 112 C312 96 392 104 408 176 C424 248 400 352 352 410 C322 446 282 446 268 434 Z" /></svg>`;

export class Guide {
  // drawIcon(ctx, id, px): paints a tool icon (toolart's drawToolIcon).
  constructor(drawIcon) {
    this.drawIcon = drawIcon;
    this.tab = 'tools';
    this.at = { tools: 0, conditions: 0 };
    this.all = false;
    const el = this.el = document.createElement('section');
    el.id = 'guide';
    el.className = 'guide';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Field guide');
    el.innerHTML = `<div class="guide-card">
      <header class="guide-head">
        <div class="eyebrow">Field guide</div>
        <button class="guide-close" aria-label="Close the guide">✕</button>
      </header>
      <nav class="guide-tabs" role="tablist">
        <button role="tab" data-tab="tools">Tools</button>
        <button role="tab" data-tab="conditions">Conditions</button>
        <button role="tab" data-tab="trim">The trim</button>
      </nav>
      <div class="guide-list"></div>
      <article class="guide-page" tabindex="-1"></article>
      <footer class="guide-foot">
        <button class="guide-prev">‹ Prev</button>
        <label class="guide-all" hidden><input type="checkbox"> Show all</label>
        <button class="guide-next">Next ›</button>
      </footer>
    </div>`;
    document.body.appendChild(el);
    const q = (s) => el.querySelector(s);
    q('.guide-close').addEventListener('click', () => this.close());
    el.addEventListener('click', (e) => { if (e.target === el) this.close(); });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      else if (e.key === 'ArrowLeft') this.step(-1);
      else if (e.key === 'ArrowRight') this.step(1);
      e.stopPropagation();
    });
    // The title card starts the game on any pointerup under it: keep the guide's taps here.
    el.addEventListener('pointerup', (e) => e.stopPropagation());
    for (const b of el.querySelectorAll('.guide-tabs button')) b.addEventListener('click', () => { this.tab = b.dataset.tab; this.render(); });
    q('.guide-prev').addEventListener('click', () => this.step(-1));
    q('.guide-next').addEventListener('click', () => this.step(1));
    q('.guide-all input').addEventListener('change', (e) => { this.all = e.target.checked; this.render(); });
  }

  // Open over whatever is showing; onClose runs once it's shut.
  open(route, onClose) {
    this.route = route;
    this.onClose = onClose;
    this.back = document.activeElement;
    this.el.hidden = false;
    this.render();
    this.el.querySelector('.guide-tabs [aria-selected="true"]')?.focus();
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.back?.focus?.({ preventScroll: true });
    const cb = this.onClose;
    this.onClose = null;
    cb?.();
  }

  get isOpen() { return !this.el.hidden; }

  entries() {
    const book = guideBook({ history: this.route.history, all: this.all, rep: this.route.rep });
    return this.tab === 'tools' ? book.tools : this.tab === 'conditions' ? book.conditions : null;
  }

  step(d) {
    const list = this.entries();
    if (!list) return;
    this.at[this.tab] = (this.at[this.tab] + d + list.length) % list.length;
    this.render();
  }

  render() {
    const q = (s) => this.el.querySelector(s);
    for (const b of this.el.querySelectorAll('.guide-tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === this.tab));
    const showAll = q('.guide-all');
    showAll.hidden = this.tab !== 'conditions' || !roundDone(this.route);
    showAll.querySelector('input').checked = this.all;
    const list = this.entries();
    q('.guide-prev').hidden = q('.guide-next').hidden = !list;
    const listEl = q('.guide-list'), page = q('.guide-page');
    listEl.hidden = !list;
    if (!list) {
      page.innerHTML = `<h2>The trim</h2><p class="sub">Five steps, the same on every foot. The guided first trim walks you through them.</p>
        <ol class="guide-steps">${TRIM_PAGE.map(([t, d]) => `<li><b>${esc(t)}.</b> ${esc(d)}</li>`).join('')}</ol>
        <p class="plan">Balance and correctness score; speed doesn’t. Pink means thin: ease off. Drawing blood ends the case.</p>`;
      return;
    }
    const k = this.at[this.tab] = Math.min(this.at[this.tab], list.length - 1);
    listEl.replaceChildren(...list.map((e, i) => {
      const b = document.createElement('button');
      b.className = `guide-chip${i === k ? ' on' : ''}${e.locked ? ' locked' : ''}`;
      b.textContent = e.locked ? 'Not met yet' : e.name ?? e.title;
      b.addEventListener('click', () => { this.at[this.tab] = i; this.render(); });
      return b;
    }));
    listEl.children[k]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const e = list[k];
    if (this.tab === 'tools') {
      page.innerHTML = `<div class="guide-art"><canvas class="guide-icon" aria-hidden="true"></canvas></div>
        <h2>${esc(e.name)} <kbd>${esc(e.key)}</kbd></h2>
        <p class="sub">${esc(e.hint)}</p>
        <p><b>Reach for it:</b> ${esc(e.notes[0])}</p>
        <p><b>Watch for:</b> ${esc(e.notes[1])}</p>${e.kit.map((k) => `<p><b>Kit:</b> ${esc(k)}</p>`).join('')}`;
      const cv = page.querySelector('canvas');
      const px = Math.round(96 * (devicePixelRatio || 1));
      cv.width = cv.height = px;
      this.drawIcon(cv.getContext('2d'), e.id, px);
    } else if (e.locked) {
      page.innerHTML = `<div class="guide-art locked">${LOCK_MARK}</div>
        <h2>Not met yet</h2>
        <p class="sub">Finish a cow with this one on the road and it’s written in here.</p>`;
    } else {
      page.innerHTML = `<div class="guide-art"><img src="${e.img}" width="240" height="240" alt="The ${esc(e.plain.toLowerCase())}, brushed clean"></div>
        <h2>${esc(e.title)}</h2>
        <p class="sub">${esc(e.plain)}</p>
        <dl class="guide-facts">
          <dt>Looks</dt><dd>${esc(e.look)}</dd>
          <dt>Testers</dt><dd>${esc(e.feel)}</dd>
          ${e.burst ? `<dt>Burst</dt><dd>${esc(e.burst)}</dd>` : ''}
          ${e.walkIn ? `<dt>Walk-in</dt><dd>${esc(e.walkIn)}</dd>` : ''}
          <dt>Do</dt><dd>${esc(e.todo)}</dd>
          <dt>Then</dt><dd>${esc(e.call)}</dd>
        </dl>`;
    }
    page.scrollTop = 0;
  }
}

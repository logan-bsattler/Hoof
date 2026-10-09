// Game bootstrap: state machine, input, and the frame loop.
// intro → play → (failing → fail) | (walkoff → results)

import { CFG } from './config.js';
import { Hoof, CLAW_NAME, LOOSE } from './hoof.js';
import { CASE_B } from './case.js';
import { TOOLS, TOOL_ORDER, applyStroke, applyGrind, applyBite } from './tools.js';
import { STEPS, evaluateSteps } from './steps.js';
import { newSession, scoreCase } from './scoring.js';
import { Renderer } from './render.js';
import { Particles } from './particles.js';
import { Sound, buzz } from './audio.js';
import { Walkoff } from './walkoff.js';
import { UI } from './ui.js';

const caseDef = CASE_B;
const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const particles = new Particles();

const game = {
  state: 'intro',
  hoof: null,
  session: null,
  metrics: null,
  steps: null,
  tool: 'brush',
  guides: true,
  sound: true,
  shake: 0,
  time: 0,
  metricsTimer: 0,
  scrubLevel: 0,
  knifeAccum: 0,
  failTimer: 0,
  walkoff: null,
  result: null,
  lastWarn: {},
  ptr: { x: 0, y: 0, down: false, over: false, downX: 0, downY: 0, moved: 0, biteAccum: 0, id: null },
};

const ui = new UI({
  onTool: (id) => selectTool(id),
  onRelease: () => requestRelease(),
  onToggleGuides: () => { game.guides = !game.guides; ui.setToggle('btnGuides', game.guides); },
  onToggleSound: () => { game.sound = !game.sound; Sound.setEnabled(game.sound); ui.setToggle('btnSound', game.sound); },
});

// ---------------------------------------------------------------- lifecycle

function newCase() {
  game.hoof = new Hoof(caseDef);
  game.session = newSession();
  game.metrics = game.hoof.metrics();
  game.steps = evaluateSteps(game.metrics, game.session, game.hoof, 0);
  game.time = 0;
  game.lastWarn = {};
  game.walkoff = null;
  game.result = null;
  particles.list = [];
  ui.setSteps(game.steps);
  selectTool('brush');
  document.body.classList.remove('steps-open');
}

async function showIntro() {
  game.state = 'intro';
  newCase();
  await ui.modal(
    `<div class="eyebrow">Case ${caseDef.id} · Trimmer tier</div>
     <h1>${caseDef.title}</h1>
     <p class="sub">${caseDef.subtitle}</p>
     <p>${caseDef.intro}</p>
     <ul class="howto">
       <li><b>Clean</b> to reveal what’s hiding under the muck.</li>
       <li><b>Read</b> it with the hoof testers before you commit.</li>
       <li><b>Trim</b> the five steps in order: balance beats speed.</li>
       <li><b>Never draw blood.</b> Pink means thin. Ease off.</li>
     </ul>`,
    [{ id: 'start', label: 'Lift the foot', primary: true }],
  );
  Sound.init();
  Sound.setEnabled(game.sound);
  game.state = 'play';
  ui.toast(STEPS[0].tip, 'info', 4500);
}

function selectTool(id) {
  if (!TOOLS[id]) return;
  if (game.tool === 'grinder' && game.ptr.down) Sound.grinder(false);
  game.tool = id;
  ui.setTool(id);
}

// -------------------------------------------------------------------- input

function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * CFG.view.w,
    y: ((e.clientY - r.top) / r.height) * CFG.view.h,
  };
}

canvas.addEventListener('pointerdown', (e) => {
  if (game.state === 'walkoff') { game.walkoff.skip(); return; }
  if (game.state !== 'play' || game.ptr.down) return;
  canvas.setPointerCapture(e.pointerId);
  const p = toLogical(e);
  Object.assign(game.ptr, { ...p, down: true, over: true, downX: p.x, downY: p.y, moved: 0, biteAccum: 0, id: e.pointerId });
  const mode = TOOLS[game.tool].mode;
  if (mode === 'bite') bite(p.x, p.y);
  if (mode === 'hold') Sound.grinder(true, 0);
});

canvas.addEventListener('pointermove', (e) => {
  const p = toLogical(e);
  const ptr = game.ptr;
  if (!ptr.down || e.pointerId !== ptr.id) { Object.assign(ptr, p, { over: true }); return; }
  const dx = p.x - ptr.x, dy = p.y - ptr.y;
  const dist = Math.hypot(dx, dy);
  ptr.moved += dist;
  if (game.state === 'play') {
    const mode = TOOLS[game.tool].mode;
    if (mode === 'stroke' && dist > 0) {
      // Interpolate stamps so fast strokes don't skip cells.
      const steps = Math.ceil(dist / 3);
      for (let s = 1; s <= steps; s++) {
        const x = ptr.x + (dx * s) / steps, y = ptr.y + (dy * s) / steps;
        handle(applyStroke(game.hoof, game.tool, x, y, dist / steps), x, y);
        if (game.state !== 'play') break;
      }
      game.scrubLevel = Math.min(1, game.scrubLevel + dist / 60);
    } else if (mode === 'bite') {
      ptr.biteAccum += dist;
      if (ptr.biteAccum >= CFG.tools.nippers.spacing) {
        ptr.biteAccum = 0;
        bite(p.x, p.y);
      }
    }
  }
  ptr.x = p.x; ptr.y = p.y;
});

function endPointer(e) {
  const ptr = game.ptr;
  if (!ptr.down || e.pointerId !== ptr.id) return;
  ptr.down = false;
  if (TOOLS[game.tool].mode === 'hold') Sound.grinder(false);
  if (game.state === 'play' && TOOLS[game.tool].mode === 'tap' && ptr.moved < 12) tap(ptr.x, ptr.y);
  if (e.pointerType !== 'mouse') ptr.over = false;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', (e) => { if (!game.ptr.down && e.pointerType === 'mouse') game.ptr.over = false; });

window.addEventListener('keydown', (e) => {
  if (game.state !== 'play') return;
  const t = TOOL_ORDER.find((id) => TOOLS[id].key === e.key);
  if (t) selectTool(t);
  else if (e.key === 'g' || e.key === 'G') document.getElementById('btnGuides').click();
  else if (e.key === 'm' || e.key === 'M') document.getElementById('btnSound').click();
});

// ------------------------------------------------------------------ actions

function bite(x, y) {
  const ev = applyBite(game.hoof, x, y);
  if (ev.removed > 0) {
    Sound.snip();
    buzz(8);
    particles.spawn('chunk', x, y, '#76603f', Math.min(5, 1 + Math.round(ev.dead / 20)));
  }
  handle(ev, x, y);
}

function tap(x, y) {
  const hoof = game.hoof;
  const i = hoof.cellAt(x, y);
  if (game.tool === 'probe') {
    const r = hoof.probe(i, !!game.session.diagnosis);
    if (r.kind === 'lesion' && !game.session.diagnosis) {
      Sound.spring();
      buzz([10, 40, 20]);
      particles.spawn('puff', x, y, '#e8dcc0', 2);
      ui.toast(r.text, 'info');
      diagnose();
    } else {
      Sound.tock();
      buzz(5);
      ui.toast(r.text, r.kind === 'thin' ? 'warn' : 'info');
    }
  } else if (game.tool === 'block') {
    if (i < 0) { ui.toast('Tap a claw to glue the block onto it.'); return; }
    placeBlock(hoof.claw[i]);
  }
}

async function diagnose() {
  game.state = 'modal';
  const pick = await ui.modal(
    `<div class="eyebrow">Commit the read</div>
     <h2>It springs under the testers.</h2>
     <p>A soft spot at the sole/heel junction of the outer claw. What are you looking at?</p>`,
    caseDef.diagnosisOptions.map((o) => ({ id: o.id, label: o.label })),
  );
  const opt = caseDef.diagnosisOptions.find((o) => o.id === pick);
  game.session.diagnosis = pick;
  game.session.diagnosisCorrect = pick === caseDef.diagnosis;
  await ui.modal(
    `<div class="eyebrow">${game.session.diagnosisCorrect ? 'Good read' : 'Not quite'}</div>
     <p>${opt.feedback}</p><p class="plan">${caseDef.plan}</p>`,
    [{ id: 'ok', label: 'Get to work', primary: true }],
  );
  if (game.session.diagnosisCorrect) Sound.step();
  game.state = 'play';
}

function placeBlock(claw) {
  const s = game.session;
  const hoof = game.hoof;
  s.blockAttempts.push(claw);
  if (!s.diagnosis) s.blockBeforeDx = true;
  hoof.block = claw;
  Sound.clunk();
  buzz(30);
  game.shake = 4;
  if (claw === caseDef.lesion.claw) {
    ui.toast('That’s the sore claw! The block goes on the SOUND claw so the ulcer can rest.', 'warn', 4000);
  } else {
    ui.toast(`Block glued to the sound ${CLAW_NAME[claw]} claw. The ulcer is off the ground now.`, 'good');
  }
}

function warnOnce(key, msg, kind = 'warn', gap = 4) {
  if ((game.lastWarn[key] ?? -99) + gap > game.time) return;
  game.lastWarn[key] = game.time;
  ui.toast(msg, kind, 3200);
  if (kind === 'warn') { Sound.warn(); buzz([20, 30, 20]); }
}

// Turn tool events into feedback, log entries, and failure.
function handle(ev, x, y) {
  const s = game.session;
  const tool = game.tool;

  if (ev.mud > 0.05 && Math.random() < Math.min(1, ev.mud * 0.5)) particles.spawn('mud', x, y, '#4f3a25');
  if (ev.removed > 0.01) {
    if (tool === 'knife') {
      if (Math.random() < Math.min(1, ev.removed * 0.15)) particles.spawn('shaving', x, y, '#efe2c2');
      game.knifeAccum += ev.removed;
      if (game.knifeAccum > 6) { game.knifeAccum = 0; Sound.knife(); buzz(4); }
    } else if (tool === 'grinder') {
      if (Math.random() < Math.min(1, ev.removed * 0.4)) particles.spawn('dust', x, y, '#f2e6c8', 2);
    } else if (tool === 'rasp') {
      if (Math.random() < 0.15) particles.spawn('dust', x, y, '#e6d8b8');
    }
  }
  if (ev.loose[LOOSE.HEEL] + ev.loose[LOOSE.ULCER] > 0) {
    particles.spawn('flake', x, y, '#d9c79c', 1);
    Sound.flake();
  }

  if (ev.claws.size && s.firstCutClaw == null) s.firstCutClaw = [...ev.claws][0];
  if (ev.dirtyCut) {
    s.dirtyCuts++;
    warnOnce('dirty', 'You’re cutting through muck. Clean the foot first: you can’t read what you can’t see.');
  }
  if (ev.nipLive) warnOnce('nip', 'Nippers are for the overgrown toe. Too blunt for the living sole.');
  if (ev.grinderLesion) {
    s.grinderLesion = true;
    warnOnce('grindLesion', 'Not the grinder near the ulcer! Use the knife there.');
  }
  if (ev.lesionCut) warnOnce('lesion', 'Easy. That’s the ulcer itself. Open it, don’t carve it.');
  else if (ev.thin) warnOnce('thin', 'Sole’s getting thin here. Ease off.');
  if (ev.blockedSkip) warnOnce('blocked', 'Can’t trim under the block.', 'info', 6);

  if (ev.blood) fail(x, y);
}

function fail(x, y) {
  game.session.blood = true;
  game.state = 'failing';
  game.failTimer = 1.4;
  game.shake = 10;
  game.ptr.down = false;
  Sound.grinder(false);
  Sound.moo(true);
  buzz([60, 40, 120]);
  particles.spawn('blood', x, y, '#c0101c', 10);
}

async function requestRelease() {
  if (game.state !== 'play') return;
  document.body.classList.remove('steps-open');
  const left = game.steps.status.filter((s) => !s.done).length;
  if (left > 0) {
    game.state = 'modal';
    const r = await ui.modal(
      `<h2>Release her now?</h2><p>${left} step${left > 1 ? 's' : ''} still unfinished. She’ll walk on the foot as it is.</p>`,
      [{ id: 'back', label: 'Keep working', primary: true }, { id: 'go', label: 'Release anyway' }],
    );
    game.state = 'play';
    if (r !== 'go') return;
  }
  game.metrics = game.hoof.metrics();
  game.result = scoreCase(game.metrics, game.session, game.hoof, caseDef);
  game.walkoff = new Walkoff(game.result, Sound);
  game.state = 'walkoff';
}

async function showResults() {
  game.state = 'results';
  const r = game.result;
  const bars = [['Balance', 'balance', 35], ['Correctness', 'correctness', 30], ['Restraint', 'restraint', 20], ['Finish', 'finish', 15]]
    .map(([label, key, w]) => {
      const v = Math.round(r.parts[key]);
      return `<div class="bar"><span>${label} <em>${w}%</em></span><div class="track"><div style="width:${v}%"></div></div><b>${v}</b></div>`;
    }).join('');
  await ui.modal(
    `<div class="eyebrow">Trimmer’s ticket · Case ${caseDef.id}</div>
     <h1 class="grade ${r.medal}">${r.grade}</h1>
     <p class="sub">Score ${r.total} / 100 · walked off <b>${r.gait}</b></p>
     ${bars}
     <ul class="notes">${r.notes.map((n) => `<li>${n}</li>`).join('')}</ul>`,
    [{ id: 'again', label: 'Trim another', primary: true }],
  );
  showIntro();
}

async function showFail() {
  game.state = 'results';
  await ui.modal(
    `<div class="eyebrow">Case failed</div>
     <h1 class="grade fail">Drew blood</h1>
     <p>You cut into the corium. She flinched, and the foot will be sore for weeks.</p>
     <p class="plan">Watch the pink tint and the mm gauge, and let the resistance tell you when to stop. When in doubt, leave it. Caution always beats aggression.</p>`,
    [{ id: 'again', label: 'Try again', primary: true }],
  );
  showIntro();
}

// --------------------------------------------------------------------- loop

function resize() {
  const wrap = document.getElementById('canvasWrap');
  const { w, h } = CFG.view;
  const s = Math.min(wrap.clientWidth / w, wrap.clientHeight / h);
  renderer.resize(Math.floor(w * s), Math.floor(h * s), Math.min(2.5, window.devicePixelRatio || 1));
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(document.getElementById('canvasWrap'));

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.time += dt;
  game.shake = Math.max(0, game.shake - dt * 25);

  if (game.state === 'play') {
    const ptr = game.ptr;
    if (ptr.down && game.tool === 'grinder') {
      const ev = applyGrind(game.hoof, ptr.x, ptr.y, dt);
      Sound.grinder(true, Math.min(1, ev.removed / 4));
      if (ev.removed > 0.05) buzz(4);
      handle(ev, ptr.x, ptr.y);
    }
    game.scrubLevel = Math.max(0, game.scrubLevel - dt * 4);
    Sound.scrub('brush', game.tool === 'brush' && ptr.down ? game.scrubLevel : 0);
    Sound.scrub('rasp', game.tool === 'rasp' && ptr.down ? game.scrubLevel : 0);

    game.metricsTimer -= dt;
    if (game.metricsTimer <= 0 && game.state === 'play') {
      game.metricsTimer = 0.15;
      game.metrics = game.hoof.metrics();
      const prevDone = game.steps.status.filter((s) => s.done).length;
      game.steps = evaluateSteps(game.metrics, game.session, game.hoof, game.time);
      const nowDone = game.steps.status.filter((s) => s.done).length;
      if (nowDone > prevDone) {
        Sound.step();
        particles.spawn('spark', game.ptr.x, game.ptr.y, '#7bbf6a', 8);
        const c = game.steps.current;
        if (c >= 0) ui.toast(STEPS[c].tip, 'good', 4500);
        else ui.toast('Every step done. Release her and watch her walk.', 'good', 4500);
      }
      // The pressure-release beat: first time the ulcer is opened.
      if (!game.session.released && game.metrics.looseRemain[LOOSE.ULCER] < 0.6) {
        game.session.released = true;
        const L = caseDef.lesion;
        Sound.release();
        buzz([15, 30, 40]);
        particles.spawn('puff', L.x, L.y, '#e9dfc8', 6);
        ui.toast('Pressure released. You can almost hear her sigh.', 'good', 3200);
      }
      ui.setSteps(game.steps);
    }
  } else {
    Sound.scrub('brush', 0);
    Sound.scrub('rasp', 0);
  }

  if (game.state === 'failing') {
    game.failTimer -= dt;
    if (game.failTimer <= 0) showFail();
  }

  particles.update(dt);
  draw();

  if (game.state === 'walkoff') {
    game.walkoff.update(dt);
    if (game.walkoff.done) showResults();
  }
  requestAnimationFrame(frame);
}

function draw() {
  const ctx = renderer.ctx;
  renderer.begin(game.shake);
  if (game.state === 'walkoff' || (game.state === 'results' && game.walkoff)) {
    game.walkoff.draw(ctx);
    return;
  }
  const hoof = game.hoof;
  renderer.background();
  renderer.leg();
  renderer.hoof(hoof, !!game.session.diagnosis);
  if (game.guides) renderer.guides(hoof);
  const ghost = game.tool === 'block' && game.ptr.over ? hoof.claw[hoof.cellAt(game.ptr.x, game.ptr.y)] ?? 0 : 0;
  renderer.block(hoof, ghost);
  renderer.labels();
  particles.draw(ctx);
  renderer.meter(game.metrics);
  if (game.state === 'play') renderer.cursor(game.tool, game.ptr, hoof, game.guides, game.time);
}

resize();
showIntro();
requestAnimationFrame(frame);

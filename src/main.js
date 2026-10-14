// Game bootstrap: state machine, input, and the frame loop.
// title → route → visit → intro → play → (failing → fail) | (walkoff → results) → … → day → route

import { CFG, touchAngle, tolOf } from './config.js';
import { Hoof, CLAW_NAME, LOOSE, lesionSpot } from './hoof.js';
import { CASE_B, dealCase, makeCase, temperament } from './case.js';
import { TOOLS, TOOL_ORDER, applyStroke, applyGrind, applyBite, applySpray, applyWrap, applyPry } from './tools.js';
import { stepsFor, evaluateSteps, trimFinished, stepTip, suggestedTool } from './steps.js';
import { newSession, scoreCase, judgeBlood, trimUnderway, blockOn } from './scoring.js';
import { CALLS, CONDITIONS } from './conditions.js';
import { Renderer } from './render.js';
import { paintScenery } from './scenery.js';
import { fitCamera, toScene } from './view.js';
import { Particles } from './particles.js';
import { Sound, buzz } from './audio.js';
import { Walkoff } from './walkoff.js';
import { UI } from './ui.js';
import { Tutorial } from './tutorial.js';
import { Guide } from './guide.js';
import { drawToolIcon } from './toolart.js';
import { loadRound, saveRound, clearRound, hasProgress } from './save.js';
import { FARMS, FOOTBATH, HOUSING, onSand, farmById, isOpen, newRoute, nextLocked, startVisit, visitHerd, recordCow, endVisit, farmCows, backLine, visitCases, TIERS, GUIDES_TEXT, tierFor } from './route.js';

// The round starts at the first farm on the road, whose first cow is the hand-built Case B.
// Dev aid: ?cond=<condition id>[&seed=n] is free play on that condition instead ("Trim another"
// deals fresh cows), varied by any of &foot=front &growth= &mud= &temper= &decoys= &size= &at=
// (see makeCase's mods). ?farm=<id> starts a visit there; ?rep=n starts with that reputation.
const devCase = new URLSearchParams(location.search);
function devMods() {
  const num = (k) => (devCase.has(k) ? +devCase.get(k) : undefined);
  const mods = {
    foot: devCase.get('foot') ?? undefined, growth: num('growth'), mud: num('mud'), temper: num('temper'),
    decoyCount: num('decoys'), lesionSize: num('size'), lesionAt: num('at'),
  };
  return Object.fromEntries(Object.entries(mods).filter(([, v]) => v !== undefined));
}
const freePlay = devCase.has('cond');
let caseDef = freePlay ? makeCase(devCase.get('cond'), +(devCase.get('seed') ?? 1), devMods()) : CASE_B;
// The trimmer's round (route.js), saved on this device after each cow (save.js).
const route = loadRound();
// Free play never touches the round: a saved day in progress waits for the next normal launch.
if (freePlay) route.visit = null;
if (devCase.has('rep')) route.rep = Math.max(0, +devCase.get('rep') || 0);
let herd = [];         // the cows of the visit in progress, in order
const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const particles = new Particles();

const game = {
  state: 'title',
  hoof: null,
  session: null,
  metrics: null,
  steps: null,
  tool: 'brush',
  // The knife in hand (WP12.4): it wears only on a sand farm, and lasts the visit until swapped.
  knife: { sand: false, wear: 0 },
  guides: true,
  sound: true,
  shake: 0,
  time: 0,
  metricsTimer: 0,
  scrubLevel: 0,
  knifeAccum: 0,
  pullRemoved: 0,
  failTimer: 0,
  weepT: 0,
  holdLast: null,
  buzzT: 0,             // grinder haptic throttle
  walkoff: null,
  result: null,
  lastWarn: {},
  tutorial: null,       // a Tutorial during the guided first run, else null
  ptr: { x: 0, y: 0, down: false, over: false, downX: 0, downY: 0, moved: 0, biteAccum: 0, id: null, touch: false, cut: false },
};

document.getElementById('routeReset').addEventListener('click', () => restartRound());

// The field guide (WP11.2). Opened mid-cow it pauses her: the frame loop skips the 'guide'
// state, so no fidget, flinch or clock, and closing puts her back exactly where she was.
// Not over the walk-off, a score card or any other card.
const guide = new Guide(drawToolIcon);
function openGuide() {
  if (guide.isOpen || !['title', 'route', 'play'].includes(game.state)) return;
  const was = game.state;
  if (was === 'play') {
    releaseHold();
    game.state = 'guide';
  }
  guide.open(route, () => { if (game.state === 'guide') game.state = was; });
}
document.getElementById('btnBook').addEventListener('click', openGuide);
const titleBook = document.getElementById('titleBook');
titleBook.addEventListener('click', openGuide);
// The title card starts the game on any pointerup or Enter: not on its guide button.
titleBook.addEventListener('pointerup', (e) => e.stopPropagation());
titleBook.addEventListener('keydown', (e) => e.stopPropagation());

const ui = new UI({
  onTool: (id) => pickTool(id),
  onRelease: () => requestRelease(),
  onCall: () => requestCall(),
  onRead: () => { if (game.state === 'play' && !game.session.diagnosis) diagnose(); },
  onToggleGuides: () => setGuides(!game.guides),
  onToggleSound: () => { game.sound = !game.sound; Sound.setEnabled(game.sound); ui.setToggle('btnSound', game.sound); },
  onToggleLefty: () => setLefty(!CFG.touch.leftHanded),
});

function setGuides(on) {
  game.guides = on;
  ui.setToggle('btnGuides', on);
  if (game.steps && game.hoof) showSteps();
}

// The step list, with the next tool flagged only while the guides are on.
function showSteps() {
  // The guided run flags its own beat's tool instead.
  const hint = game.tutorial ? game.tutorial.beat?.tool ?? null
    : game.guides ? suggestedTool(game.steps.current, game.metrics ?? game.hoof.metrics(), caseDef) : null;
  ui.setSteps(game.steps, caseDef, hint);
}

// A slip with this cow: at the 'mistake' tier the guides come on for the rest of her trim.
function slip() {
  if (game.guideMode !== 'mistake' || game.guides) return;
  setGuides(true);
  setTimeout(() => { if (game.state === 'play') ui.toast('Guides on for the rest of this one.', 'info', 2600); }, 3300);
}

// Left-handed touch grip, remembered on this device.
function setLefty(on) {
  CFG.touch.leftHanded = on;
  ui.setToggle('btnLefty', on);
  try { localStorage.setItem('truehoof.lefty', on ? '1' : '0'); } catch { /* storage blocked */ }
}
try { setLefty(localStorage.getItem('truehoof.lefty') === '1'); } catch { /* storage blocked */ }

// Best result per case, remembered on this device.
const bestKey = () => `truehoof.best.${caseDef.id}`;
function loadBest() {
  try { return JSON.parse(localStorage.getItem(bestKey())) ?? null; } catch { return null; }
}
// Records a finished result; true when it beats the stored best.
function saveBest(r) {
  const best = loadBest();
  if (r.failed || (best && best.total >= r.total)) return false;
  try { localStorage.setItem(bestKey(), JSON.stringify({ grade: r.grade, total: r.total })); } catch { /* storage blocked */ }
  return true;
}

// ---------------------------------------------------------------- lifecycle

function newCase() {
  game.hoof = new Hoof(caseDef);
  game.preparing = true;
  game.session = newSession();
  game.metrics = game.hoof.metrics();
  game.steps = evaluateSteps(game.metrics, game.session, game.hoof, 0);
  game.time = 0;
  game.lastWarn = {};
  game.walkoff = null;
  game.result = null;
  game.weepT = 0;
  game.weepAt = null;
  game.blockKind = 'rubber';
  ui.setIconKind('block', '');
  game.knife.sand = !!route.visit && onSand(farmById(route.visit.farm));
  if (!game.knife.sand) game.knife.wear = 0;
  showWear();
  // On the route the tier sets the guides and the band (WP7.6); free play keeps your chip.
  renderer.tol = tolOf(caseDef);
  game.guideMode = route.visit ? tierFor(route.rep).guides : null;
  if (game.guideMode) setGuides(game.guideMode === 'on');
  game.found = [];      // marks the testers have read this case, in order
  game.temper = temperament(caseDef.temper);
  game.fidgetT = game.temper.fidgetEvery * (0.6 + Math.random() * 0.8);
  // Nothing carries over from the last foot: no held stroke, shake or half-pulled strip.
  stopHoldSounds();
  Object.assign(game.ptr, { down: false, moved: 0, biteAccum: 0, id: null });
  Object.assign(game, { shake: 0, scrubLevel: 0, holdLast: null, knifeAccum: 0, pullRemoved: 0, metricsTimer: 0, failTimer: 0, buzzT: 0 });
  game.tutorial = null;
  document.body.classList.remove('tutorial');
  ui.setCoach(null);
  particles.list = [];
  showSteps();
  ui.setReadable(false);
  const v = route.visit;
  document.getElementById('caseTitle').textContent = v
    ? `${farmById(v.farm).name} · Cow ${v.k + 1} of ${herd.length} · ${caseDef.title} · ${caseDef.subtitle}`
    : `Case ${caseDef.id} · ${caseDef.title} · ${caseDef.subtitle}`;
  selectTool('brush');
  document.body.classList.remove('steps-open');
}

async function showIntro() {
  game.state = 'intro';
  newCase();
  const best = loadBest();
  const v = route.visit;
  const mode = await ui.modal(
    `<div class="eyebrow">${v ? `${farmById(v.farm).name} · Cow ${v.k + 1} of ${herd.length}${caseDef.back?.outcome === 'recheck' ? ' · Recheck' : ''}` : `Case ${caseDef.id} · Trimmer tier`}</div>
     <h1>${caseDef.title}</h1>
     <p class="sub">${caseDef.subtitle}</p>
     ${caseDef.back ? `<p class="back ${caseDef.back.outcome}">${backLine(caseDef)}</p>` : ''}
     <p>${caseDef.intro}</p>
     ${caseDef.traits ? `<p class="sub">${caseDef.traits}</p>` : ''}
     ${best ? `<p class="sub">Your best on this case: <b>${best.grade}</b> · ${best.total}</p>` : ''}
     <ul class="howto">
       <li><b>Clean</b> to reveal what’s hiding under the muck.</li>
       <li><b>Read</b> it with the hoof testers before you commit.</li>
       <li><b>Trim</b> the five steps in order: balance beats speed.</li>
       ${caseDef.howto ?? ''}
       ${caseDef.requires?.wrap === false ? '<li><b>Treat</b> what needs it before she goes.</li>' : caseDef.requires?.treat ? '<li><b>Treat</b> it: flush, pad and wrap before she goes.</li>' : '<li><b>Leave</b> what’s firm alone: not every mark is trouble.</li>'}
       <li><b>Never draw blood.</b> Pink means thin. Ease off.</li>
     </ul>`,
    // The guided run teaches the hind foot (inner claw first).
    // On the road, only until you've done an ulcer once.
    caseDef.condition === 'ulcer' && caseDef.foot !== 'front' &&
      !(v && route.history.some((h) => h.condition === 'ulcer'))
      ? [{ id: 'guided', label: 'Guided first trim', primary: true }, { id: 'start', label: 'Lift the foot' }]
      : [{ id: 'start', label: 'Lift the foot', primary: true }],
  );
  Sound.init();
  Sound.setEnabled(game.sound);
  game.state = 'play';
  game.tutorial = mode === 'guided' ? new Tutorial(caseDef) : null;
  document.body.classList.toggle('tutorial', !!game.tutorial);
  if (game.tutorial) updateCoach();
  else { ui.setCoach(null); ui.toast(stepTip(stepsFor(caseDef)[0], caseDef), 'info', 4500); }
}

// Guided run: move to the next beat when the current one is done.
function updateCoach() {
  const t = game.tutorial;
  if (!t) return;
  const changed = t.update(game.metrics, game.session, game.hoof);
  if (changed) {
    const b = t.beat;
    if (b) {
      // Only the first beat hands over its tool. After that the player picks the next one
      // (its button pulses): switching under a finger still on the hoof cut in the wrong place.
      if (t.index > 0) { Sound.step(); particles.spawn('spark', game.ptr.x, game.ptr.y, '#7bbf6a', 8); }
      else selectTool(b.tool);
    }
    if (game.steps && game.hoof) showSteps();
  }
  ui.setCoach(t);
}

function stopHoldSounds() {
  Sound.grinder(false);
  Sound.spray(false);
}

// The wood block comes with the farm that brings toe necrosis (or free play).
const woodOK = () => freePlay || route.rep >= farmById('ridgeway').rep;

// The player picking a tool. Picking the block again swaps rubber for wood (WP8.4) and back.
function pickTool(id) {
  if (id === 'block' && game.tool === 'block' && game.state === 'play' && woodOK()) {
    game.blockKind = game.blockKind === 'wood' ? 'rubber' : 'wood';
    ui.setIconKind('block', game.blockKind === 'wood' ? 'wood' : '');
    ui.toast(game.blockKind === 'wood' ? 'Wood block: taller, for a claw that has to stay right off the floor.' : 'Rubber block: the usual one.', 'info', 2600);
    return;
  }
  // On sand, picking the knife again swaps in a sharp one (WP12.4). Free: the skill is noticing.
  if (id === 'knife' && game.tool === 'knife' && game.state === 'play' && game.knife.sand) {
    game.knife.wear = 0;
    showWear();
    Sound.swap();
    ui.toast('Fresh knife.', 'info', 1400);
    return;
  }
  selectTool(id);
}

function showWear() {
  ui.setWear(game.knife.sand ? game.knife.wear : null);
  renderer.knifeWear = game.knife.wear;
}

function selectTool(id) {
  if (!TOOLS[id]) return;
  if (game.ptr.down) stopHoldSounds();
  game.tool = id;
  ui.setTool(id);
}

// -------------------------------------------------------------------- input

// Pointer → logical working point. A finger holds the handle, so for touch the working
// point is the tool tip, offset up-left of the finger (CFG.touch); the sprite is drawn back to it.
function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  const touch = e.pointerType === 'touch' && !CFG.touch.direct.includes(game.tool);
  const cam = renderer.cam, angle = touchAngle();
  const grip = touch ? CFG.touch.grip / cam.scale : 0; // CSS px → logical at this zoom
  const p = toScene(cam, e.clientX - r.left, e.clientY - r.top);
  return { x: p.x - grip * Math.cos(angle), y: p.y - grip * Math.sin(angle), touch };
}

canvas.addEventListener('pointerdown', (e) => {
  Sound.resume(); // the context can be suspended after the app was backgrounded
  if (game.state === 'walkoff') { game.walkoff.skip(); return; }
  if (game.state !== 'play' || game.ptr.down) return;
  canvas.setPointerCapture(e.pointerId);
  const p = toLogical(e);
  Object.assign(game.ptr, { ...p, down: true, over: true, downX: p.x, downY: p.y, moved: 0, biteAccum: 0, id: e.pointerId, cut: false });
  const mode = TOOLS[game.tool].mode;
  if (mode === 'bite') bite(p.x, p.y);
  if (mode === 'hold') {
    game.holdLast = { x: p.x, y: p.y };
    if (game.tool === 'grinder') Sound.grinder(true, 0);
    else Sound.spray(true);
  }
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
    // The knife only bites once it's been pulled: a press alone does nothing.
    const engaged = game.tool !== 'knife' || ptr.moved >= CFG.tools.knife.engage;
    if (mode === 'stroke' && dist > 0 && engaged) {
      // Interpolate stamps so fast strokes don't skip cells.
      const steps = Math.ceil(dist / 3);
      for (let s = 1; s <= steps; s++) {
        const x = ptr.x + (dx * s) / steps, y = ptr.y + (dy * s) / steps;
        renderer.stroke(game.tool, x, y, dx / steps, dy / steps);
        handle(applyStroke(game.hoof, game.tool, x, y, dist / steps, game.knife), x, y);
        if (game.state !== 'play' || !ptr.down) break;
      }
      if (game.tool === 'knife' && game.knife.sand) showWear();
      game.scrubLevel = Math.min(1, game.scrubLevel + dist / 60);
    } else if (mode === 'bite') {
      ptr.biteAccum += dist;
      if (ptr.biteAccum >= CFG.tools.nippers.spacing) {
        ptr.biteAccum = 0;
        bite(p.x, p.y);
      }
    }
  }
  ptr.x = p.x; ptr.y = p.y; ptr.touch = p.touch;
});

function endPointer(e) {
  const ptr = game.ptr;
  if (!ptr.down || e.pointerId !== ptr.id) return;
  ptr.down = false;
  if (TOOLS[game.tool].mode === 'hold') stopHoldSounds();
  // End of a knife pull: the strip curls off the blade.
  if (game.tool === 'knife' && game.pullRemoved > 1) {
    particles.spawn('shaving', ptr.x, ptr.y, '#f4ead2', Math.min(6, 1 + Math.round(game.pullRemoved / 15)));
    Sound.knife();
  }
  game.pullRemoved = 0;
  if (game.state === 'play' && TOOLS[game.tool].mode === 'tap' && ptr.moved < 12) tap(ptr.x, ptr.y);
  else if (game.state === 'play' && game.tool === 'knife' && ptr.moved < 12) pry(ptr.x, ptr.y);
  if (e.pointerType !== 'mouse') ptr.over = false;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

// Safety net: a hold the browser never ends (capture lost, app backgrounded, window blurred)
// must not keep the grinder cutting. Drops the tool without counting it as a tap.
function releaseHold() {
  const ptr = game.ptr;
  if (!ptr.down) return;
  ptr.down = false;
  stopHoldSounds();
  game.pullRemoved = 0;
  game.holdLast = null;
}
canvas.addEventListener('lostpointercapture', releaseHold);
window.addEventListener('blur', releaseHold);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseHold(); });
canvas.addEventListener('pointerleave', (e) => { if (!game.ptr.down && e.pointerType === 'mouse') game.ptr.over = false; });

window.addEventListener('keydown', (e) => {
  if (game.state !== 'play') return;
  if (e.key === 'b' || e.key === 'B') { openGuide(); return; }
  const t = TOOL_ORDER.find((id) => TOOLS[id].key === e.key);
  if (t) pickTool(t);
  else if (e.key === 'g' || e.key === 'G') document.getElementById('btnGuides').click();
  else if (e.key === 'm' || e.key === 'M') document.getElementById('btnSound').click();
});

// ------------------------------------------------------------------ actions

function bite(x, y) {
  const ev = applyBite(game.hoof, x, y);
  renderer.fx.biteT = 1;
  if (ev.removed > 0) {
    Sound.snip();
    buzz(8);
    particles.spawn('chunk', x, y, '#5e4a30', Math.min(5, 1 + Math.round(ev.dead / 20)));
  }
  handle(ev, x, y);
}

function tap(x, y) {
  const hoof = game.hoof;
  const i = hoof.cellAt(x, y);
  if (game.tool === 'probe') {
    renderer.fx.squeezeT = 1;
    const r = hoof.probe(i, !!game.session.diagnosis);
    if (r.finding && !game.found.includes(r.finding)) {
      game.found.push(r.finding);
      game.session.probes.push(r.finding.kind);
    }
    if (!game.session.diagnosis) ui.setReadable(game.found.length > 0);
    if (r.kind === 'lesion' && !game.session.diagnosis) {
      // The weeping hole: squeezing it pushes fluid and bubbles out. A white-line track is
      // still sealed under the wall: she just flinches. A false sole just sounds hollow.
      // With a lesion on each claw (J3), it's the one on the claw tested.
      const L = hoof.lesionOn(hoof.claw[i]) ?? caseDef.lesion;
      if (L.type === 'doublesole') { Sound.tock(); buzz(5); }
      else { Sound.spring(); buzz([10, 40, 20]); }
      if (L.type === 'doublesole') {
        // Hollow, not sore: she doesn't move.
      } else if (L.type === 'ulcer') {
        renderer.weep(L.x, L.y, 1);
        Sound.bubbles();
      } else if (L.type === 'dd' || L.type === 'footrot') {
        // Raw skin: a sharp flinch, the foot snatched against the strap.
        jolt(5);
        Sound.moo(true);
      } else {
        jolt(2);
      }
      ui.toast(r.text, 'info');
      // The guided run commits the read straight away; otherwise the player decides when.
      if (game.tutorial) diagnose();
    } else {
      Sound.tock();
      buzz(5);
      ui.toast(r.text, r.kind === 'thin' ? 'warn' : 'info');
    }
  } else if (game.tool === 'block') {
    if (i < 0) { ui.toast('Tap a claw to glue the block onto it.'); return; }
    placeBlock(hoof.claw[i]);
  } else if (game.tool === 'wrap') {
    dress(i < 0 ? 0 : hoof.claw[i]);
  }
}

const WRAP_MSG = {
  miss: 'Tap the treated claw to pad and wrap it.',
  sound: () => caseDef.lesion?.type === 'dd' ? 'The pad and wrap go over the lesion, on the other claw.' : 'That’s the sound claw: it has the block. The pad and wrap go over the ulcer.',
  untreated: 'No wrap for this one. Pared out and drained, it heals best open to the air.',
  closed: 'Open the ulcer first. Pare the loose horn off it with the knife.',
  unflushed: () => caseDef.lesion?.type === 'dd' ? 'Spray the raw patch in the cleft until it’s soaked before you cover it.'
    : caseDef.lesions ? 'Flush this claw’s opened lesion with the spray bottle before you cover it.' : 'Flush the opened ulcer with the spray bottle before you cover it.',
  nothing: 'She’s sound: nothing to pad or wrap.',
  nowrap: 'No wrap for foot rot. Spray it and let the vet see her.',
  early: 'Finish the trim first. The wrap goes on last, just before she’s released.',
  done: () => caseDef.call ? 'She’s wrapped. Make the call.' : 'She’s wrapped. Release her.',
  other: 'That claw’s wrapped. Now the other one.',
};

function dress(claw) {
  const r = applyWrap(game.hoof, claw, game.hoof.metrics(), trimFinished(game.steps.status));
  if (!r.ok) {
    const msg = WRAP_MSG[r.reason];
    ui.toast(typeof msg === 'function' ? msg() : msg, r.reason === 'done' ? 'good' : 'info', 3400);
    return;
  }
  buzz(15);
  if (r.stage === 1) {
    renderer.placedNow('pad', r.claw);
    Sound.pad();
    ui.toast('Pad pressed on over the treated sole. Now the wrap.', 'good');
  } else {
    renderer.placedNow('wrap', r.claw);
    Sound.wrap();
    ui.toast('Wrapped. Pink means treated: everyone will know to check her.', 'good');
  }
}

// Commit the read: what the testers found, in neutral words, then the call.
async function diagnose() {
  game.state = 'modal';
  ui.setReadable(false);
  const found = game.found.map((f) => `<li>${f.look[0].toUpperCase()}${f.look.slice(1)} on the ${CLAW_NAME[f.claw]} claw: ${f.feel}.</li>`);
  const pick = await ui.modal(
    `<div class="eyebrow">Commit the read</div>
     <h2>What the testers found</h2>
     <ul class="found">${found.join('') || '<li>Nothing tested yet.</li>'}</ul>
     <p>${caseDef.diagnosisPrompt}</p>`,
    caseDef.diagnosisOptions.map((o) => ({ id: o.id, label: o.label })),
  );
  const opt = caseDef.diagnosisOptions.find((o) => o.id === pick);
  game.session.diagnosis = pick;
  game.session.diagnosisCorrect = pick === caseDef.diagnosis;
  await ui.modal(
    `<div class="eyebrow">${game.session.diagnosisCorrect ? 'Good read' : 'Not quite'}</div>
     <p>${opt.feedback}</p>${game.session.diagnosisCorrect || game.tutorial ? `<p class="plan">${caseDef.plan}</p>` : ''}`,
    [{ id: 'ok', label: 'Get to work', primary: true }],
  );
  if (game.session.diagnosisCorrect) Sound.step();
  game.state = 'play';
}

// WP9 J2: a knife tap on last visit's block levers it off, a bit at a time.
function pry(x, y) {
  const r = applyPry(game.hoof, x, y);
  if (!r) return;
  const color = game.hoof.oldBlock.kind === 'wood' ? '#a0784a' : '#1b1b1d';
  buzz(r.off ? 30 : 12);
  game.shake = r.off ? 4 : 2;
  if (!r.off) {
    Sound.creak(r.taps / CFG.tools.knife.pryTaps);
    particles.spawn('chunk', x, y, '#e8dec4', 2);
    ui.toast(r.taps === 1 ? 'The glue’s cracking. Again.' : 'Nearly. Once more.', 'info', 1800);
    return;
  }
  Sound.crack();
  particles.spawn('chunk', x, y, color, 6);
  ui.toast('Old block off. The claw under it is yours to work again.', 'good');
}

function placeBlock(claw) {
  const s = game.session;
  const hoof = game.hoof;
  if (hoof.oldBlock?.on) { ui.toast('Take the old block off first: tap it with the knife.', 'info', 3400); return; }
  s.blockAttempts.push(claw);
  if (!s.diagnosis) s.blockBeforeDx = true;
  hoof.block = claw;
  hoof.blockKind = game.blockKind;
  renderer.placedNow('block');
  Sound.clunk();
  buzz(30);
  game.shake = 4;
  if (!caseDef.lesion) {
    ui.toast(caseDef.toeDrag ? 'Nothing in the foot to rest: a block won’t help a bad leg.' : 'She’s sound. A block only goes on to rest a sore claw.', 'warn', 4000);
  } else if (hoof.lesions().length > 1) {
    ui.toast('No block: both claws are sore. It puts her whole weight on the other bad one.', 'warn', 4500);
  } else if (!caseDef.requires?.block) {
    ui.toast('No block for this one: the trouble is in the skin of the cleft, not under a claw.', 'warn', 4000);
  } else if (claw === caseDef.lesion.claw) {
    ui.toast(`That’s the sore claw! The block goes on the SOUND claw so the ${caseDef.noun} can rest.`, 'warn', 4000);
  } else if ((caseDef.requires.block === 'wood') !== (hoof.blockKind === 'wood')) {
    ui.toast(hoof.blockKind === 'wood' ? 'Right claw, but the wood block is for a toe pared back to the bone. Rubber does here.'
      : 'Right claw, but she needs the taller wood block. Tap the block tool again to swap, then glue it on.', 'warn', 4500);
  } else {
    ui.toast(`${hoof.blockKind === 'wood' ? 'Wood block' : 'Block'} glued to the sound ${CLAW_NAME[claw]} claw. The ${caseDef.noun} is off the ground now.`, 'good');
    return;
  }
  slip();
}

// The pressure-release beat, once per lesion: the ulcer opened or the abscess drained.
function releasePressure(msg, L = caseDef.lesion) {
  const done = (game.session.released ??= {});
  if (done[L.claw]) return;
  done[L.claw] = true;
  game.weepAt = L;
  const W = lesionSpot(L);
  Sound.release();
  Sound.bubbles();
  buzz([15, 30, 40]);
  renderer.weep(W.x, W.y, 3);
  game.weepT = 4;
  ui.toast(msg, 'good', 3200);
}

// The closed cap holding under the knife: it creaks and she shifts as it's worked toward giving.
function strainCap(strain, x, y) {
  if ((game.lastWarn.capCreak ?? -99) + 0.35 > game.time) return;
  game.lastWarn.capCreak = game.time;
  Sound.creak(strain);
  buzz(6 + Math.round(strain * 10));
  jolt(0.6 + strain * 1.4);
  particles.spawn('flake', x, y, '#d9c79c', 1);
  warnOnce('capFirm', 'The cap’s firm. Keep working the knife across it: it’ll give.', 'info', 30);
}

// The cap gives: horn and core come away in one piece and the pocket floods. The knife comes
// off with it, so a sawing stroke can't run on into the raw core underneath.
function popCap(x, y) {
  const L = lesionAt(x, y);
  releaseHold();
  Sound.crack();
  jolt(5);
  particles.spawn('flake', L.x, L.y, '#d9c79c', 14);
  particles.spawn('flake', x, y, '#cdb98c', 6);
  renderer.weep(L.x, L.y, 4, 'pus');
  releasePressure('It gave! Pus out, pressure off: you can almost hear her sigh. Now pare the loose edge from outside the ring.', L);
}

// The lesion nearest (x, y): on a J3 pair, the one under the tool.
function lesionAt(x, y) {
  const ls = game.hoof.lesions();
  return ls.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a), ls[0]);
}

// Knife into the opened ulcer: it's raw tissue now, and she lets you know.
function carveOpenUlcer(x, y) {
  if ((game.lastWarn.rawCut ?? -99) + 1.2 > game.time) return;
  game.lastWarn.rawCut = game.time;
  jolt(5);
  buzz([30, 40, 30]);
  Sound.moo(true);
  const L = lesionAt(x, y);
  renderer.weep(L.x + (x - L.x) * 0.4, L.y + (y - L.y) * 0.4, 1.5, 'blood');
  warnOnce('lesion', 'She felt that! It’s open: that’s raw tissue. Pare the rim, not the ulcer.', 'warn', 4);
}

// A flinch or shift, scaled by how lively this cow is.
function jolt(amount) {
  game.shake = Math.max(game.shake, amount * game.temper.shake);
}

// A lively cow shifts her weight now and then while you work; a very lively one knocks a held
// tool off the foot. Calm cows (fidgetEvery 0) stand still.
function fidget(dt) {
  const every = game.temper.fidgetEvery;
  if (!every || (game.fidgetT -= dt) > 0) return;
  game.fidgetT = every * (0.6 + Math.random() * 0.8);
  jolt(3.5);
  Sound.clop();
  buzz(12);
  if (game.temper.kicks && game.ptr.down && TOOLS[game.tool].mode === 'hold') {
    releaseHold();
    warnOnce('kick', 'She shifted and knocked the tool off. Let her settle, then go again.', 'info', 6);
  }
}

function warnOnce(key, msg, kind = 'warn', gap = 4) {
  if ((game.lastWarn[key] ?? -99) + gap > game.time) return;
  game.lastWarn[key] = game.time;
  ui.toast(msg, kind, 3200);
  if (kind === 'warn') { Sound.warn(); buzz([20, 30, 20]); slip(); }
}

// The tools that take horn off (not the brush or the spray).
const CUTTERS = new Set(['knife', 'grinder', 'nippers', 'rasp']);

// Turn tool events into feedback, log entries, and failure.
function handle(ev, x, y) {
  const s = game.session;
  const tool = game.tool;

  if (ev.mud > 0.05 && Math.random() < Math.min(1, ev.mud * 0.5)) {
    particles.spawn('mud', x, y, '#2e2216');
    if (Math.random() < 0.5) particles.spawn('straw', x, y, '#c8a352');
  }
  if (ev.removed > 0.01) {
    // One stroke that took horn off, however long the hold (a cow to be left counts them).
    if (CUTTERS.has(tool) && !game.ptr.cut) { game.ptr.cut = true; s.cuts++; }
    if (tool === 'knife') {
      if (Math.random() < Math.min(1, ev.removed * 0.15)) particles.spawn('shaving', x, y, '#f4ead2');
      game.knifeAccum += ev.removed;
      game.pullRemoved += ev.removed;
      if (game.knifeAccum > 6) { game.knifeAccum = 0; Sound.knife(); buzz(4); }
    } else if (tool === 'grinder') {
      // The disc throws a spray of white dust off its trailing edge.
      if (Math.random() < Math.min(1, ev.removed * 0.6)) {
        particles.spawn('dust', x + 14, y + 10, '#f6efe0', 3, [-150, 70]);
      }
    } else if (tool === 'rasp') {
      if (Math.random() < 0.15) particles.spawn('dust', x, y, '#e6d8b8');
    }
  }
  if (ev.loose[LOOSE.HEEL] + ev.loose[LOOSE.ULCER] + ev.loose[LOOSE.TRACT] + ev.loose[LOOSE.DOUBLE] > 0) {
    particles.spawn('flake', x, y, '#d9c79c', 1);
    Sound.flake();
  }

  if (ev.claws.size && s.firstCutClaw == null && trimUnderway(s, caseDef)) s.firstCutClaw = [...ev.claws][0];
  if (ev.dirtyCut) {
    s.dirtyCuts++;
    warnOnce('dirty', 'You’re cutting through muck. Clean the foot first: you can’t read what you can’t see.');
  }
  if (ev.tooDeep) warnOnce('nipDeep', 'Too much horn for one bite. Start at the tip and work back toward the hoof.', 'info');
  if (ev.nipSole) warnOnce('nip', 'Nippers are for the overgrown toe. Too blunt for the living sole.');
  else if (ev.nipLive) warnOnce('nipLine', 'That bite reached the trim line. Ease back a touch: the grinder does the rest.', 'info', 8);
  if (ev.grinderLesion) {
    s.grinderLesion = true;
    warnOnce('grindLesion', caseDef.lesion?.type === 'doublesole' ? 'Not the grinder on the false sole! It tears into the thin new sole. Lift the old layer off with the knife.'
      : `Not the grinder near the ${caseDef.noun}! Use the knife there.`);
  }
  if (ev.capStrain && !ev.capPop) strainCap(ev.capStrain, x, y);
  if (ev.capPop) popCap(x, y);
  if (ev.lesionCut) carveOpenUlcer(x, y);
  else if (ev.thin) warnOnce('thin', 'Sole’s getting thin here. Ease off.');
  // She flinches as a blade nears the living sole: a lively cow sooner and harder.
  if (ev.minLive < game.temper.flinchAt && (game.lastWarn.flinch ?? -99) + 2.5 <= game.time) {
    game.lastWarn.flinch = game.time;
    jolt(3);
    buzz([15, 20, 15]);
    if (game.temper.kicks) Sound.moo(true);
    warnOnce('flinchTip', 'She flinched: the sole’s getting thin under there.', 'info', 8);
  }
  if (ev.drain) releasePressure('The pus is out. Pressure off: you can almost hear her sigh.', game.hoof.lesions().find((l) => l.pocket) ?? caseDef.lesion);
  if (ev.offTrack) warnOnce('offTrack', caseDef.lesion?.type === 'foreign' ? 'Nothing opens from here. Start right on the mark and work outward.' : 'Nothing opens from here. Follow the dark line in from the wall.', 'info');
  if (ev.cleftCut) {
    s.cleftCuts++;
    // She flinches once per warning, not on every stamp of the blade.
    const fresh = (game.lastWarn.cleft ?? -99) + 4 <= game.time;
    const skin = caseDef.lesion?.type === 'dd' || caseDef.lesion?.type === 'footrot';
    if (fresh && skin) { jolt(4); Sound.moo(true); }
    warnOnce('cleft', skin
      ? 'No blade in the cleft! That’s raw skin: spray it, don’t cut it.'
      : 'That’s the heel cleft: skin, not horn. Keep the blades out of it.');
  }
  if (ev.blockedSkip) warnOnce('blocked', game.hoof.oldBlock?.on ? 'Can’t trim under the old block. Tap it with the knife to pry it off.' : 'Can’t trim under the block.', 'info', 6);

  if (ev.blood) {
    if (judgeBlood(s, ev.bloodCells) === 'nick') nick(x, y);
    else fail(x, y);
  }
}

// A shallow first nick: she flinches, the tool comes off, and the case goes on.
function nick(x, y) {
  releaseHold();
  jolt(6);
  Sound.moo(true);
  buzz([40, 30, 60]);
  particles.spawn('blood', x, y, '#c0101c', 1);
  ui.toast('She felt that. One more and you’re done.', 'warn', 3600);
  slip();
}

function fail(x, y) {
  game.session.blood = true;
  game.state = 'failing';
  game.failTimer = 1.4;
  game.shake = 10;
  game.ptr.down = false;
  stopHoldSounds();
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
  const hoof = game.hoof;
  // The weight test shows the trimmed foot as it stands, without guides or HUD.
  const drawFoot = () => {
    renderer.background();
    renderer.hoof(hoof, false, game.metrics);
    renderer.block(hoof);
    renderer.dressing(hoof);
  };
  game.walkoff = new Walkoff(game.result, Sound, { wrapped: hoof.wrapped, side: hoof.side, foot: caseDef.foot, hoof, drawFoot });
  game.state = 'walkoff';
}

// The other way off the line (WP8.1): the hospital pen, the vet, or left till dry-off. She goes
// as she is, with no walk-off: her ticket says where she went.
async function requestCall() {
  if (game.state !== 'play') return;
  document.body.classList.remove('steps-open');
  releaseHold();
  game.state = 'modal';
  const r = await ui.modal(
    `<h2>Send her off the line?</h2><p>She leaves the crush as she is now, whatever’s left undone.</p>
     <ul class="calls">${Object.values(CALLS).map((c) => `<li><b>${c.label}.</b> ${c.sub}</li>`).join('')}</ul>`,
    [...Object.entries(CALLS).map(([id, c]) => ({ id, label: c.label })), { id: 'back', label: 'Back' }],
  );
  game.state = 'play';
  if (!CALLS[r]) return;
  game.session.call = r;
  game.metrics = game.hoof.metrics();
  game.result = scoreCase(game.metrics, game.session, game.hoof, caseDef);
  game.walkoff = null;
  Sound.step();
  showResults();
}

async function showResults() {
  game.state = 'results';
  const r = game.result;
  const newBest = saveBest(r);
  const bars = [['Balance', 'balance', 35], ['Correctness', 'correctness', 30], ['Restraint', 'restraint', 20], ['Finish', 'finish', 15]]
    .map(([label, key, w]) => {
      const v = Math.round(r.parts[key]);
      return `<div class="bar"><span>${label} <em>${w}%</em></span><div class="track"><div style="width:${v}%"></div></div><b>${v}</b></div>`;
    }).join('');
  const earned = route.visit ? recordCow(route, caseDef, r) : null;
  if (earned) saveRound(route);
  await ui.modal(
    `<div class="eyebrow">Trimmer’s ticket · ${route.visit ? farmById(route.visit.farm).name : `Case ${caseDef.id}`}</div>
     <h1 class="grade ${r.medal}">${r.grade}</h1>
     <p class="sub">Score ${r.total} / 100 · ${r.call ? `<b>${CALLS[r.call].ticket}</b>` : `walked off <b>${r.gait}</b>`}${newBest ? ' · <b>New best</b>' : ''}</p>
     ${earned ? repLine(earned) : ''}
     ${bars}
     <ul class="notes">${r.notes.map((n) => `<li>${n}</li>`).join('')}</ul>`,
    [{ id: 'again', label: earned ? nextLabel(earned) : 'Trim another', primary: true }],
  );
  if (earned) { nextCow(earned); return; }
  caseDef = dealCase((Math.random() * 1e9) >>> 0);
  showIntro();
}

async function showFail() {
  game.state = 'results';
  const earned = route.visit ? recordCow(route, caseDef, { failed: true, grade: 'Failed', gait: 'lame', block: blockOn(game.hoof) }) : null;
  if (earned) saveRound(route);
  await ui.modal(
    `<div class="eyebrow">Case failed</div>
     <h1 class="grade fail">Drew blood</h1>
     <p>You cut into the corium. She flinched, and the foot will be sore for weeks.</p>
     ${earned ? repLine(earned) : ''}
     <p class="plan">Watch the pink tint and the mm gauge, and let the resistance tell you when to stop. When in doubt, leave it. Caution always beats aggression.</p>`,
    [{ id: 'again', label: earned ? nextLabel(earned) : 'Try again', primary: true }],
  );
  if (earned) { nextCow(earned); return; }
  showIntro();
}

// ---------------------------------------------------------------- the round

// What this cow did for your name, on her ticket. Reputation only goes up.
function repLine({ points, lame, back }) {
  if (lame) return '<p class="rep-line lame">She’s going lame: no reputation for this one. The farmer will want her looked at again.</p>';
  return `<p class="rep-line">+${points} reputation${back === 'recheck' ? ' · back on her feet' : ''}</p>`;
}
const nextLabel = ({ last }) => (last ? 'End of the day' : 'Next cow');

function nextCow({ last }) {
  if (last) { showDay(); return; }
  caseDef = herd[route.visit.k];
  showIntro();
}

// The day summary: every cow's grade and gait, and what the visit earned.
async function showDay() {
  game.state = 'results';
  const d = endVisit(route);
  saveRound(route);
  Sound.step();
  const rows = d.rows.map((r) => `<tr class="${r.lame ? 'lame' : ''}">
      <td>${r.tag.replace('Holstein ', '')}${r.back ? ` <span class="again" title="${r.back === 'recheck' ? 'Recheck' : 'Seen before'}">↺</span>` : ''}</td><td>${r.title}</td><td>${r.grade}</td>
      <td>${r.gait}</td><td class="pts">${r.lame ? '—' : `+${r.points}`}</td></tr>`).join('');
  const flagged = d.rows.filter((r) => r.lame).length;
  const opened = d.opened.map((f) => `<p class="rep-line">New on the road: <b>${f.name}</b> (${HOUSING[f.housing].toLowerCase()})</p>`).join('');
  const next = nextLocked(route);
  await ui.modal(
    `<div class="eyebrow">End of the day · ${d.farm.name}</div>
     <h1>+${d.earned} reputation</h1>
     <p class="sub">Reputation ${d.before} → <b>${d.rep}</b>${next ? ` · ${next.name} opens at ${next.rep}` : ''}</p>
     <table class="day"><thead><tr><th>Cow</th><th>Case</th><th>Grade</th><th>Walked</th><th></th></tr></thead><tbody>${rows}</tbody></table>
     ${d.bonus ? `<p class="rep-line">Whole herd walked off sound: +${d.bonus}</p>` : ''}
     ${d.mended.length ? `<p class="rep-line">Back on her feet: ${d.mended.map((t) => `<b>${t.replace('Holstein ', '')}</b>`).join(', ')}</p>` : ''}
     ${flagged ? `<p class="plan">${flagged === 1 ? 'One cow' : `${flagged} cows`} went off lame. ${d.farm.farmer[0].toUpperCase()}${d.farm.farmer.slice(1)} will want a second look next visit.</p>` : ''}
     ${opened}`,
    [{ id: 'road', label: 'Back on the road', primary: true }],
  );
  showRoute();
}

// The visit card: who the farmer is, what the yard is like, how many cows are waiting.
async function showVisit(farm, { fromMap = true } = {}) {
  game.state = 'modal';
  const n = (route.visits[farm.id] ?? 0) + 1;
  const farmer = `${farm.farmer[0].toUpperCase()}${farm.farmer.slice(1)}`;
  // Who's coming back: the lame ones from last time, and a few you trimmed well.
  const herdNow = visitCases(farm, n, route.history);
  const back = herdNow.filter((cd) => cd.back);
  // Cows close to calving (J1): the farmer says so, and that's the only cue.
  const due = herdNow.filter((cd) => cd.calving);
  // A known kicker (WP12.2): the farmer warns you.
  const kicker = herdNow.find((cd) => cd.kicker);
  const tags = (list) => list.map((cd) => `<b>${cd.subtitle.split(' · ')[0].replace('Holstein ', '')}</b>`).join(', ');
  const rechecks = back.filter((cd) => cd.back.outcome === 'recheck');
  // A black toe is due back whatever happened (WP8.4); the rest came back lame.
  const toes = rechecks.filter((cd) => CONDITIONS[cd.back.was]?.recheck);
  const lame = rechecks.filter((cd) => !CONDITIONS[cd.back.was]?.recheck);
  const healed = back.filter((cd) => cd.back.outcome === 'healed').length;
  const calved = back.filter((cd) => cd.back.outcome === 'calved');
  const pick = await ui.modal(
    `<div class="eyebrow">${HOUSING[farm.housing]} · ${n === 1 ? 'First visit' : `Visit ${n}`}</div>
     <h1>${farm.name}</h1>
     <p class="sub">${farmer} · ${farm.cows} cows waiting · ${FOOTBATH[farm.footbath].text.toLowerCase()}${back.length ? ` · ${back.length} you’ve trimmed before` : ''}</p>
     <p>${farm.intro}</p>
     ${lame.length ? `<p class="back recheck">${farmer} wants a second look at ${tags(lame)}: lame after last time.</p>` : ''}
     ${toes.length ? `<p class="back recheck">${tags(toes)} ${toes.length === 1 ? 'is' : 'are'} due back for the toe recheck: a black toe is never done in one visit.</p>` : ''}
     ${due.map((cd) => `<p class="back">${farmer} mentions ${tags([cd])}’s due to calve in ${cd.calving} days.</p>`).join('')}
     ${kicker ? `<p class="back recheck">“Mind ${tags([kicker])}: she kicks.”</p>` : ''}
     ${onSand(farm) ? '<p class="back">Sand in the stalls means grit in the horn: it takes the edge off a knife fast. Tap the knife again for a fresh one.</p>' : ''}
     ${calved.length ? `<p class="back healed">${tags(calved)} ${calved.length === 1 ? 'has' : 'have'} calved since last time and ${calved.length === 1 ? 'is' : 'are'} due ${calved.length === 1 ? 'her' : 'their'} trim.</p>` : ''}
     ${healed ? `<p class="back healed">${healed === 1 ? 'One cow' : `${healed} cows`} from last time ${healed === 1 ? 'is' : 'are'} back for ${healed === 1 ? 'her' : 'their'} next trim.</p>` : ''}`,
    fromMap
      ? [{ id: 'go', label: 'Start the day', primary: true }, { id: 'back', label: 'Back to the road' }]
      : [{ id: 'go', label: 'Start the day', primary: true }],
  );
  if (pick !== 'go') { showRoute(); return; }
  herd = startVisit(route, farm.id);
  game.knife.wear = 0; // sharpened every morning
  saveRound(route);
  caseDef = herd[0];
  showIntro();
}

// The road: every farm in order, the open ones tappable, the locked ones showing what opens them.
function showRoute() {
  game.state = 'route';
  stopHoldSounds();
  const el = document.getElementById('route');
  const next = nextLocked(route);
  // The suggested stop: the furthest open farm you haven't worked yet, else the furthest open one.
  const open = FARMS.filter((f) => isOpen(f, route.rep));
  const suggest = [...open].reverse().find((f) => !route.visits[f.id]) ?? open[open.length - 1];
  const tier = tierFor(route.rep);
  document.getElementById('routeRep').innerHTML = `Reputation <b>${route.rep}</b>` +
    (next ? ` · ${next.name} opens at ${next.rep}` : ' · every farm on the road is open') +
    `<br><span class="tier">${tier.name} · ${GUIDES_TEXT[tier.guides].toLowerCase()} · ±${tier.tolerance.toFixed(2)} mm band</span>`;
  const list = document.getElementById('routeStops');
  list.replaceChildren(...FARMS.map((f) => {
    const li = document.createElement('li');
    const on = isOpen(f, route.rep);
    const visits = route.visits[f.id] ?? 0;
    const sore = farmCows(route.history, f.id).filter((h) => h.lame).length;
    li.className = `stop ${on ? 'open' : 'locked'}${f === suggest ? ' suggest' : ''}${visits ? ' visited' : ''}`;
    const meta = on
      ? `${HOUSING[f.housing]} · ${FOOTBATH[f.footbath].text.toLowerCase()} · ${f.cows} cows${visits ? ` · best day +${route.best[f.id]}` : ''}${sore ? ` · ${sore} to recheck` : ''}`
      : `Opens at reputation ${f.rep}`;
    // Where the help turns down: the farm each tier opens with.
    const step = TIERS.find((t) => t.rep > 0 && t.rep === f.rep);
    const from = step ? `<span class="stop-tier">${GUIDES_TEXT[step.guides]} from here</span>` : '';
    li.innerHTML = `<button ${on ? '' : 'disabled'}><span class="pin" aria-hidden="true"></span>
      <span class="stop-name">${f.name}</span><span class="stop-meta">${meta}</span>${from}</button>`;
    if (on) {
      li.querySelector('button').addEventListener('click', () => {
        el.hidden = true;
        showVisit(f);
      });
    }
    return li;
  }));
  el.hidden = false;
  document.getElementById('routeReset').hidden = !hasProgress(route);
  list.querySelector('.suggest')?.scrollIntoView({ block: 'center' });
  list.querySelector('.suggest button')?.focus({ preventScroll: true });
}

// After the title: free play on a dev case, the day left off, a visit to ?farm, or the first farm.
function begin() {
  if (freePlay) { showIntro(); return; }
  // A reload mid-visit picks the day up at the next cow, or its summary if every cow is done.
  if (route.visit) { herd = visitHerd(route); nextCow({ last: route.visit.k >= herd.length }); return; }
  const dev = farmById(devCase.get('farm'));
  if (dev && isOpen(dev, route.rep)) { showVisit(dev, { fromMap: false }); return; }
  // With a saved round, the road map; the first time out, straight to the first farm.
  if (hasProgress(route)) { showRoute(); return; }
  showVisit(FARMS[0], { fromMap: false });
}

// "Start the round over", behind a confirm: wipes the save and goes back to farm 1.
async function restartRound() {
  const el = document.getElementById('route');
  el.hidden = true;
  game.state = 'modal';
  const pick = await ui.modal(
    `<h2>Start the round over?</h2><p>Your reputation (${route.rep}), every farm you’ve opened and every cow’s history will be gone. This can’t be undone.</p>`,
    [{ id: 'keep', label: 'Keep my round', primary: true }, { id: 'reset', label: 'Start over' }],
  );
  if (pick !== 'reset') { showRoute(); return; }
  clearRound();
  Object.assign(route, newRoute());
  showVisit(FARMS[0], { fromMap: false });
}

// --------------------------------------------------------------------- loop

// Phones zoom onto the hoof; the walk-off is composed for the whole scene, so it gets the full view.
const walkoffShown = () => game.state === 'walkoff' || (game.state === 'results' && !!game.walkoff);
const viewMode = () => (window.innerWidth <= CFG.view.phone.maxW && !walkoffShown() ? 'hoof' : 'full');

// Window resize and the ResizeObserver can both fire in one frame: fit once per frame.
let resizeQueued = false;
function resize() {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    const wrap = document.getElementById('canvasWrap');
    renderer.resize(fitCamera(wrap.clientWidth, wrap.clientHeight, viewMode()), Math.min(2.5, window.devicePixelRatio || 1));
  });
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(document.getElementById('canvasWrap'));

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // The guide pauses her: nothing moves and no clock runs while it's open.
  if (game.state === 'guide') { requestAnimationFrame(frame); return; }
  game.time += dt;
  game.shake = Math.max(0, game.shake - dt * 25);
  // No case is dealt until the title card is tapped, and the road map covers the canvas between visits.
  // The first visit card also comes up before any cow is in the crush.
  if (game.state === 'title' || game.state === 'route' || !game.session) { requestAnimationFrame(frame); return; }
  // A new foot's textures take seconds on a phone: build them a slice a frame behind the case
  // card's loading bar, so the card is up at once and the game never locks.
  if (game.preparing) {
    const p = renderer.prepare(game.hoof, 24);
    ui.setLoading(p);
    if (p < 1) { requestAnimationFrame(frame); return; }
    game.preparing = false;
  }

  if (game.state === 'play') {
    const ptr = game.ptr;
    fidget(dt);
    renderer.fx.grindOn = ptr.down && game.tool === 'grinder';
    if (ptr.down && TOOLS[game.tool].mode === 'hold') {
      const last = game.holdLast ?? { x: ptr.x, y: ptr.y };
      const dx = ptr.x - last.x, dy = ptr.y - last.y;
      game.holdLast = { x: ptr.x, y: ptr.y };
      if (game.tool === 'grinder') {
        renderer.stroke('grinder', ptr.x, ptr.y, dx, dy);
        const ev = applyGrind(game.hoof, ptr.x, ptr.y, dt);
        Sound.grinder(true, Math.min(1, ev.removed / 4), ev.danger);
        // The handle buzzes harder as the sole thins; throttled so it reads as a pulse, not a hum.
        game.buzzT -= dt;
        if (ev.removed > 0.05 && game.buzzT <= 0) {
          buzz(4 + Math.round(ev.danger * 14));
          game.buzzT = 0.1;
        }
        handle(ev, ptr.x, ptr.y);
      } else if (game.tool === 'spray') {
        const ev = applySpray(game.hoof, ptr.x, ptr.y, dt);
        renderer.sprayDecal(ptr.x, ptr.y, CFG.tools.spray.radius * 0.8, dt);
        particles.spawn('mist', ptr.x - 8, ptr.y + 8, '#bff0e2', 3, [70, -60]);
        if (ev.sprayLesion > 0 && !game.session.flushed) {
          game.session.flushed = true;
          ui.toast(caseDef.lesion?.type === 'footrot' ? 'Spraying the split skin. Soak all of it.'
            : caseDef.lesion?.type === 'dd' ? 'Spraying the raw patch. Soak all of it.'
            : 'Flushing the pocket. Flush again after each round of paring.', 'good', 3200);
        }
        handle(ev, ptr.x, ptr.y);
      }
    }
    // The opened pocket keeps weeping for a while.
    if (game.weepT > 0) {
      game.weepT -= dt;
      const W = lesionSpot(game.weepAt ?? caseDef.lesion);
      if (Math.random() < dt * 5) renderer.weep(W.x, W.y, 0.5);
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
      if (game.tutorial) updateCoach();
      else if (nowDone > prevDone) {
        Sound.step();
        particles.spawn('spark', game.ptr.x, game.ptr.y, '#7bbf6a', 8);
        const c = game.steps.current;
        if (c >= 0) ui.toast(stepTip(stepsFor(caseDef)[c], caseDef), 'good', 4500);
        else ui.toast('Every step done. Release her and watch her walk.', 'good', 4500);
      }
      showSteps();
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
  renderer.update(dt);
  if (viewMode() !== renderer.cam.mode) resize();
  draw();

  if (game.state === 'walkoff') {
    game.walkoff.update(dt);
    if (game.walkoff.done) showResults();
  }
  requestAnimationFrame(frame);
}

// The foot has been brushed clean at least once (sticky: a little fresh muck doesn't hide the read).
const wasCleaned = () => game.session.stepDoneAt.clean != null;

// Guides follow the trim step in hand. None during the read, unless the player starts
// cutting before committing it: then they get the lines for the step they're on.
function guideStep() {
  if (!wasCleaned()) return null;
  const st = game.steps.status;
  if (!st[1].done && game.session.firstCutClaw == null) return null;
  return st.find((s) => !s.done && s.id !== 'diagnose')?.id ?? null;
}

function draw() {
  const ctx = renderer.ctx;
  renderer.begin(game.shake);
  if (walkoffShown()) {
    game.walkoff.draw(ctx);
    return;
  }
  const hoof = game.hoof;
  renderer.background();
  renderer.hoof(hoof, !!game.session.diagnosis, game.metrics);
  const aim = game.ptr.over && game.state === 'play' ? hoof.claw[hoof.cellAt(game.ptr.x, game.ptr.y)] ?? 0 : 0;
  renderer.block(hoof, game.tool === 'block' ? aim : 0, game.blockKind);
  renderer.dressing(hoof, game.tool === 'wrap' ? aim : 0);
  renderer.setGuides(game.guides && game.state === 'play' ? guideStep() : null);
  renderer.guides(hoof);
  if (game.tutorial?.beat && game.state === 'play') renderer.coach(game.tutorial.beat.target, game.tutorial.progress, game.time);
  renderer.labels(hoof);
  particles.draw(ctx);
  renderer.meter(game.metrics, hoof.side, wasCleaned());
  if (game.state === 'play') renderer.cursor(game.tool, game.ptr, hoof, game.guides, game.time);
}

// Title card, once per launch. Browsers only allow audio after a gesture, so the first tap
// starts the barn's room tone and a distant moo as the card fades into the case.
function showTitle() {
  const el = document.getElementById('title');
  const barn = document.getElementById('titleBarn');
  const paint = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const sw = CFG.view.w + 2 * CFG.view.phone.bleed, sh = CFG.view.h;
    const cw = el.clientWidth, ch = el.clientHeight;
    const s = Math.max(cw / sw, ch / sh); // cover
    barn.width = Math.round(cw * dpr);
    barn.height = Math.round(ch * dpr);
    const img = paintScenery(s * dpr);
    barn.getContext('2d').drawImage(img, (barn.width - img.width) / 2, (barn.height - img.height) / 2);
  };
  paint();
  window.addEventListener('resize', paint);
  return new Promise((resolve) => {
    const go = (e) => {
      if (e.type === 'keydown') {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault(); // or the same key press activates the case card's first button
      }
      el.removeEventListener('pointerup', go);
      el.removeEventListener('keydown', go);
      window.removeEventListener('resize', paint);
      Sound.init();
      Sound.setEnabled(game.sound);
      Sound.distantMoo(0.5);
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 450);
      resolve(); // the case card comes up under the fade
    };
    el.addEventListener('pointerup', go);
    el.addEventListener('keydown', go);
    el.focus();
  });
}

// Dev aid: ?debug exposes the game state and renderer (its .cam maps logical ↔ screen) in the console.
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { hoofGame: game, hoofRenderer: renderer, hoofRoute: route, hoofRound: { showRoute, showDay, recordCow: (r) => recordCow(route, caseDef, r), nextCow } });

resize();
showTitle().then(begin);
requestAnimationFrame(frame);

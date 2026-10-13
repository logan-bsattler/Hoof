// Central tunables. Everything that changes how the game *feels* lives here.

// The on-target band (mm) for a case: wider early on the route (WP7.6), else CFG.sole.tolerance.
export const tolOf = (caseDef) => caseDef?.tolerance ?? CFG.sole.tolerance;

// Tip → handle direction for touch, mirrored for left-handed players.
export const touchAngle = () => (CFG.touch.leftHanded ? Math.PI - CFG.touch.angle : CFG.touch.angle);

export const CFG = {
  // Logical play-field size (portrait). The canvas is scaled to fit the screen.
  // minText: smallest canvas text in CSS px, however far a small phone scales the field down.
  view: {
    w: 400, h: 720, minText: 11,
    // Phones (`maxW` CSS px wide or less) zoom onto the hoof (src/view.js): `content` is the
    // logical box that must stay in view (claws, labels, tutorial targets), `hudH` the CSS px
    // HUD strip above it, `bleed` how far the scenery is painted past each side of the scene.
    phone: { maxW: 860, content: { x: 38, y: 172, w: 324, h: 492 }, hudH: 48, bleed: 80 },
  },

  // Touch: the finger holds the tool's handle, so the working tip sits `grip` px up-left of
  // the touch point (along `angle`, radians, pointing tip → handle) and the cut stays visible.
  // grip is in CSS px, so the tip sits the same distance from the finger at any zoom.
  // Mouse and pen work at the pointer as before.
  // leftHanded mirrors it (tip up-right, handle to the lower left); toggled by the Lefty chip.
  // Tools in `direct` (spray, testers) still work right under the finger: you aim them, not hold them.
  touch: { grip: 46, angle: 1.05, leftHanded: false, direct: ['spray', 'probe'] },

  // Simulation grid laid over the hoof. Each cell tracks sole thickness, mud, etc.
  grid: { cell: 4, x0: 32, y0: 150, cols: 84, rows: 120 },

  // Sole thickness targets in mm (AHDB five-step method; tune for feel).
  sole: {
    target: 7,        // weight-bearing sole after functional trim
    dishTarget: 4.5,  // the modelled dish behind the axial wall
    thin: 3,          // below this the sole flexes: warning zone
    heel: 5,          // heel bulb horn: leave it alone
    tolerance: 0.75,  // +/- band that counts as "on target"
    ramp: 1.5,        // cuts slow over this many mm above a zone's target, down to the tool's `resist`
  },

  // Tool behaviour. Rates are mm removed per px of movement (stroke tools)
  // or per second (grinder). `resist` is the removal multiplier at a cell's zone target,
  // eased in over `sole.ramp` mm above it: the "you're nearly there" assist.
  tools: {
    brush:   { radius: 34, mudRate: 0.02 },
    // Knife: hold and pull. It bites once pulled `engage` px, then cuts a wide, even strip.
    // capGive: knife travel over a closed ulcer cap (px) before it gives; capLift: how far round
    // the blade the cap tears away with the core when it does, in ulcer radii. flat: the stamp
    // falloff above which the blade cuts at full depth; the cap and open core answer only to that.
    knife:   { radius: 14, rate: 0.075, resist: 0.35, engage: 6, capGive: 90, capLift: 1.75, flat: 0.4, wall: 0.5 },
    grinder: { radius: 20, rate: 8.5, resist: 0.3, resistThin: 0.15, wall: 0.7 },
    // wall (knife, grinder): cut-rate multiplier on living wall, harder horn than the sole.
    // jawDepth: most dead horn (px, from the cut to the far tip) one bite can take.
    nippers: { radius: 17, liveBite: 3.5, liveCore: 0.4, spacing: 16, jawDepth: 22 },
    rasp:    { radius: 26, smooth: 0.02, rate: 0.003 },
    // tint gained per second at full strength; pareWash is lost per px of knife travel.
    spray:   { radius: 22, rate: 1.6, hornRate: 0.3, rinse: 0.6, pareWash: 0.05 },
  },

  // Blood: the first shallow cut (at most `maxCells` cells in one stroke) is a nick she flinches at.
  // A second nick, or a deeper cut, fails the case. A nick caps the grade and costs Restraint.
  // Walk-off weight test: horn within `band` mm of its claw's highest bearing point touches the floor.
  // Mobility follows the AHDB 0-3 scale from the gait.
  contact: { band: 0.5 },
  mobility: { sound: 0, tender: 1, lame: 2, blockedSore: 3 },

  nick: { maxCells: 3, restraint: 40, capGrade: 'Sound' },

  // Cow temperament, 0 calm to 1 lively (0.5 is the old default cow). Each pair runs calm → lively.
  // flinchAt: the living sole (mm) she flinches at under a blade; kept under the dish target's
  // band so a correct dish never sets her off. shake: how hard every flinch jolts the view.
  // Above `fidgetFrom` she shifts her weight every `fidgetEvery` s or so while you work;
  // above `kickFrom` a shift knocks a held tool off the foot.
  temper: { flinchAt: [2.4, 3.6], shake: [0.6, 1.5], fidgetFrom: 0.45, fidgetEvery: [16, 6], kickFrom: 0.8 },

  // Treatment: how well-flushed the opened ulcer must be before it's padded and wrapped.
  treat: { tintMin: 0.6 },

  // Score weighting (design doc §8).
  weights: { balance: 0.35, correctness: 0.30, restraint: 0.20, finish: 0.15 },

  grades: [
    { min: 85, name: 'Textbook', medal: 'gold' },
    { min: 70, name: 'Clean', medal: 'silver' },
    { min: 50, name: 'Sound', medal: 'bronze' },
    { min: 0, name: 'Needs work', medal: 'none' },
  ],
};

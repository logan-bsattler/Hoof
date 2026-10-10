// Central tunables. Everything that changes how the game *feels* lives here.

export const CFG = {
  // Logical play-field size (portrait). The canvas is scaled to fit the screen.
  view: { w: 400, h: 720 },

  // Touch: the finger holds the tool's handle, so the working tip sits `grip` px up-left of
  // the touch point (along `angle`, radians, pointing tip → handle) and the cut stays visible.
  // Mouse and pen work at the pointer as before.
  touch: { grip: 68, angle: 1.05 },

  // Simulation grid laid over the hoof. Each cell tracks sole thickness, mud, etc.
  grid: { cell: 4, x0: 32, y0: 150, cols: 84, rows: 120 },

  // Sole thickness targets in mm (AHDB five-step method; tune for feel).
  sole: {
    target: 7,        // weight-bearing sole after functional trim
    dishTarget: 4.5,  // the modelled dish behind the axial wall
    thin: 3,          // below this the sole flexes: warning zone
    heel: 5,          // heel bulb horn: leave it alone
    tolerance: 0.75,  // +/- band that counts as "on target"
  },

  // Tool behaviour. Rates are mm removed per px of movement (stroke tools)
  // or per second (grinder). `resist` multiplies removal once a cell is at
  // or below its zone target — the "you're nearly there" assist.
  tools: {
    brush:   { radius: 34, mudRate: 0.02 },
    // Knife: hold and pull. It bites once pulled `engage` px, then cuts a wide, even strip.
    knife:   { radius: 14, rate: 0.12, resist: 0.35, engage: 6 },
    grinder: { radius: 20, rate: 14, resist: 0.3, resistThin: 0.15 },
    // jawDepth: most dead horn (px, from the cut to the far tip) one bite can take.
    nippers: { radius: 17, liveBite: 3.5, liveCore: 0.4, spacing: 16, jawDepth: 22 },
    rasp:    { radius: 26, smooth: 0.02, rate: 0.003 },
    // tint gained per second at full strength; pareWash is lost per px of knife travel.
    spray:   { radius: 22, rate: 1.6, hornRate: 0.3, rinse: 0.6, pareWash: 0.05 },
  },

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

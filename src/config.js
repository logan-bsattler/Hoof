// Central tunables. Everything that changes how the game *feels* lives here.

export const CFG = {
  // Logical play-field size (portrait). The canvas is scaled to fit the screen.
  view: { w: 400, h: 720 },

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
    knife:   { radius: 9,  rate: 0.09, resist: 0.35 },
    grinder: { radius: 20, rate: 14, resist: 0.3, resistThin: 0.15 },
    nippers: { radius: 12, liveBite: 3.5, spacing: 16 },
    rasp:    { radius: 26, smooth: 0.02, rate: 0.003 },
  },

  // Score weighting (design doc §8).
  weights: { balance: 0.35, correctness: 0.30, restraint: 0.20, finish: 0.15 },

  grades: [
    { min: 85, name: 'Textbook', medal: 'gold' },
    { min: 70, name: 'Clean', medal: 'silver' },
    { min: 50, name: 'Sound', medal: 'bronze' },
    { min: 0, name: 'Needs work', medal: 'none' },
  ],
};

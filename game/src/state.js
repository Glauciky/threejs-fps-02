// The one place match state lives. Every module reads the match through this
// store and writes it through its functions; nothing keeps a second copy of
// the score, the money or the round clock.
export const PHASE = {
  FREEZE: 'freeze',
  LIVE: 'live',
  END: 'end',
  MATCH: 'match',
};

export const WIN = {
  ELIMINATION: 'elimination',
  DETONATION: 'detonation',
  DEFUSED: 'defused',
  TIMEOUT: 'timeout',
};

export const ECONOMY = {
  START: 800,
  KILL: 300,
  WIN: 3250,
  LOSS: 1900,
  LOSS_STREAK: 500,
  LOSS_MAX: 2900,
  PLANT: 300,
};

export const MATCH = {
  ROUND_SECONDS: 100,
  FREEZE_SECONDS: 3,
  PLANT_SECONDS: 35,
  WIN_ROUNDS: 7,
  MAX_ROUNDS: 13,
};

export function createMatch() {
  return {
    phase: PHASE.FREEZE,
    round: 1,
    roundTime: MATCH.ROUND_SECONDS,
    freezeTime: MATCH.FREEZE_SECONDS,
    score: { ravens: 0, bulwark: 0 },
    money: ECONOMY.START,
    lossStreak: 0,
    kills: 0,
    deaths: 0,
    winReason: null,
    winner: null,
    matchWinner: null,
    plantSite: null,
  };
}

export function resetRound(match) {
  match.phase = PHASE.FREEZE;
  match.roundTime = MATCH.ROUND_SECONDS;
  match.freezeTime = MATCH.FREEZE_SECONDS;
  match.winReason = null;
  match.winner = null;
  match.plantSite = null;
}

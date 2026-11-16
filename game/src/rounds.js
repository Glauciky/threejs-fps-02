// Rounds and the economy. The round clock lives here: a 3-second freeze with
// the buy menu, 100 seconds live, then a win by elimination, detonation,
// defusal or timeout. Payouts follow the match store; first to 7 rounds,
// at most 13. The caller owns the entities and resets them on round start.
import { PHASE, WIN, ECONOMY, MATCH, resetRound } from './state.js';

export function createRounds(match, events) {
  function startRound() {
    resetRound(match);
    events.resetEntities();
    events.onRoundStart(match.round);
  }

  function endRound(winner, reason) {
    if (match.phase === PHASE.END || match.phase === PHASE.MATCH) return;
    match.phase = PHASE.END;
    match.winner = winner;
    match.winReason = reason;
    if (winner === 'ravens') {
      match.score.ravens += 1;
      match.money += ECONOMY.WIN;
      match.lossStreak = 0;
    } else {
      match.score.bulwark += 1;
      const payout = Math.min(ECONOMY.LOSS_MAX, ECONOMY.LOSS + match.lossStreak * ECONOMY.LOSS_STREAK);
      match.money += payout;
      match.lossStreak += 1;
    }
    events.onRoundEnd(winner, reason);
    if (match.score.ravens >= MATCH.WIN_ROUNDS || match.score.bulwark >= MATCH.WIN_ROUNDS || match.round >= MATCH.MAX_ROUNDS) {
      match.phase = PHASE.MATCH;
      match.matchWinner = match.score.ravens > match.score.bulwark ? 'ravens' : match.score.bulwark > match.score.ravens ? 'bulwark' : null;
      events.onMatchEnd(match.matchWinner);
    }
  }

  function nextRound() {
    if (match.phase === PHASE.MATCH) return;
    match.round += 1;
    startRound();
  }

  function step(dt) {
    if (match.phase === PHASE.FREEZE) {
      match.freezeTime -= dt;
      if (match.freezeTime <= 0) {
        match.phase = PHASE.LIVE;
        events.onLive();
      }
    } else if (match.phase === PHASE.LIVE) {
      match.roundTime -= dt;
      if (match.roundTime <= 0) {
        match.roundTime = 0;
        endRound('bulwark', WIN.TIMEOUT);
      }
    }
  }

  function checkElimination(ravensAlive, bulwarkAlive) {
    if (match.phase !== PHASE.LIVE) return;
    if (bulwarkAlive === 0) endRound('ravens', WIN.ELIMINATION);
    else if (ravensAlive === 0) endRound('bulwark', WIN.ELIMINATION);
  }

  return {
    startRound,
    endRound,
    nextRound,
    step,
    checkElimination,
    awardKill() {
      match.money += ECONOMY.KILL;
      match.kills += 1;
    },
    awardPlant() {
      match.money += ECONOMY.PLANT;
    },
    noteDeath() {
      match.deaths += 1;
    },
  };
}

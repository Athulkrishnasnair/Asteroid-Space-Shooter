// src/game/level2Consensus.js
// Cooperative CV consensus engine for Level 2 Shared Spaceship.
// Enforces agreement between both players, latches valid commands for 350-500ms,
// provides majority voting over rolling frames to eliminate jitter,
// and supports single-player / manual fallbacks.

const DIRECTION_ORDER = ['LEFT', 'CENTER', 'RIGHT', 'DOWN', 'UP'];

export function normalizeDirection(value) {
  const dir = (value || '').toString().toUpperCase();
  if (dir === 'FORWARD' || dir === 'UP') return 'UP';
  if (dir === 'BACK' || dir === 'DOWN') return 'DOWN';
  if (dir === 'LEFT') return 'LEFT';
  if (dir === 'RIGHT') return 'RIGHT';
  if (dir === 'CENTER' || dir === 'MIDDLE' || dir === 'NONE') return 'CENTER';
  return 'CENTER';
}

export function buildMajorityVote(history = []) {
  if (!history.length) return 'CENTER';
  const counts = {};
  for (const entry of history) {
    const dir = normalizeDirection(entry);
    counts[dir] = (counts[dir] || 0) + 1;
  }

  let winner = 'CENTER';
  let winnerCount = -1;
  for (const dir of DIRECTION_ORDER) {
    const count = counts[dir] || 0;
    if (count > winnerCount) {
      winner = dir;
      winnerCount = count;
    }
  }

  return winner;
}

export function resolveDirectionalCommand({
  p1Dir,
  p2Dir,
  p1Visible = true,
  p2Visible = true,
  history = [],
  previousCommand = 'CENTER',
  lastChangedAt = 0,
  now = performance.now(),
  holdUntil = 0,
  graceUntil = 0,
}) {
  const left = normalizeDirection(p1Dir);
  const right = normalizeDirection(p2Dir);

  // Both players visible scenario
  const bothVisible = p1Visible && p2Visible;
  const singleVisible = (p1Visible && !p2Visible) || (!p1Visible && p2Visible);

  // Determine active direction when only 1 player is detected (demo / single-player fallback)
  if (singleVisible) {
    const soloDir = p1Visible ? left : right;
    if (soloDir !== 'CENTER') {
      return {
        direction: soloDir,
        action: 'MOVE',
        dx: soloDir === 'LEFT' ? -1 : soloDir === 'RIGHT' ? 1 : 0,
        dy: soloDir === 'UP' ? -1 : soloDir === 'DOWN' ? 1 : 0,
        isDisagreed: false,
        holdActive: false,
        isSolo: true,
        p1Matches: p1Visible && soloDir !== 'CENTER',
        p2Matches: p2Visible && soloDir !== 'CENTER',
      };
    }
  }

  // If both players visible, check agreement
  const isAgreed = bothVisible && left !== 'CENTER' && left === right;
  const isDirectConflict = bothVisible && left !== 'CENTER' && right !== 'CENTER' && left !== right;

  // 1. If direct conflict (e.g. P1 LEFT, P2 RIGHT), immediately STOP
  if (isDirectConflict) {
    return {
      direction: 'CENTER',
      action: 'STOP',
      dx: 0,
      dy: 0,
      isDisagreed: true,
      holdActive: false,
      p1Matches: false,
      p2Matches: false,
    };
  }

  // 2. Both agree on a valid direction -> MOVE and hold
  if (isAgreed) {
    const direction = left;
    return {
      direction,
      action: 'MOVE',
      dx: direction === 'LEFT' ? -1 : direction === 'RIGHT' ? 1 : 0,
      dy: direction === 'UP' ? -1 : direction === 'DOWN' ? 1 : 0,
      isDisagreed: false,
      holdActive: true,
      newHoldUntil: now + 450, // Latch command for 450ms
      p1Matches: true,
      p2Matches: true,
    };
  }

  // 3. Hold active: If a valid command was agreed upon and we are within the 450ms hold window,
  // continue moving even if one player glances back to CENTER momentarily
  if (previousCommand && previousCommand !== 'CENTER' && now < holdUntil) {
    // Only continue if neither player is actively looking in the opposite direction
    const oppositeDir = previousCommand === 'LEFT' ? 'RIGHT' : previousCommand === 'RIGHT' ? 'LEFT' : previousCommand === 'UP' ? 'DOWN' : 'UP';
    if (left !== oppositeDir && right !== oppositeDir) {
      return {
        direction: previousCommand,
        action: 'MOVE',
        dx: previousCommand === 'LEFT' ? -1 : previousCommand === 'RIGHT' ? 1 : 0,
        dy: previousCommand === 'UP' ? -1 : previousCommand === 'DOWN' ? 1 : 0,
        isDisagreed: false,
        holdActive: true,
        p1Matches: left === previousCommand,
        p2Matches: right === previousCommand,
      };
    }
  }

  // 4. Majority vote over history buffer for smoothing
  if (history.length >= 3) {
    const majority = buildMajorityVote(history);
    if (majority !== 'CENTER' && (left === majority || right === majority)) {
      return {
        direction: majority,
        action: 'MOVE',
        dx: majority === 'LEFT' ? -1 : majority === 'RIGHT' ? 1 : 0,
        dy: majority === 'UP' ? -1 : majority === 'DOWN' ? 1 : 0,
        isDisagreed: false,
        holdActive: false,
        p1Matches: left === majority,
        p2Matches: right === majority,
      };
    }
  }

  // 5. Grace period when tracking drops temporarily
  if (previousCommand && previousCommand !== 'CENTER' && now < graceUntil) {
    return {
      direction: previousCommand,
      action: 'MOVE',
      dx: previousCommand === 'LEFT' ? -1 : previousCommand === 'RIGHT' ? 1 : 0,
      dy: previousCommand === 'UP' ? -1 : previousCommand === 'DOWN' ? 1 : 0,
      isDisagreed: false,
      holdActive: false,
      p1Matches: false,
      p2Matches: false,
    };
  }

  return {
    direction: 'CENTER',
    action: 'STOP',
    dx: 0,
    dy: 0,
    isDisagreed: false,
    holdActive: false,
    p1Matches: false,
    p2Matches: false,
  };
}

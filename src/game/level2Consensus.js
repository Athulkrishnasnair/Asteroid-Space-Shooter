const DIRECTION_ORDER = ['LEFT', 'CENTER', 'RIGHT', 'DOWN', 'UP'];

export function normalizeDirection(value) {
  const dir = (value || '').toString().toUpperCase();
  if (dir === 'FORWARD' || dir === 'UP') return 'UP';
  if (dir === 'BACK' || dir === 'DOWN') return 'DOWN';
  if (dir === 'LEFT') return 'LEFT';
  if (dir === 'RIGHT') return 'RIGHT';
  if (dir === 'CENTER' || dir === 'MIDDLE' || dir === 'NONE' || dir === 'FORWARD') return 'CENTER';
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
  p1Visible,
  p2Visible,
  history,
  previousCommand,
  lastChangedAt,
  now,
  graceUntil = 0,
}) {
  const left = normalizeDirection(p1Dir);
  const right = normalizeDirection(p2Dir);
  const stableLeft = p1Visible ? left : 'CENTER';
  const stableRight = p2Visible ? right : 'CENTER';

  const samples = Array.isArray(history) && history.length > 0 ? history.map(normalizeDirection) : [stableLeft, stableRight];
  const majority = buildMajorityVote(samples);
  const isManualAgreement = stableLeft !== 'CENTER' && stableLeft === stableRight;
  const commandsMatch = stableLeft === stableRight && stableLeft !== 'CENTER';

  if (commandsMatch) {
    const direction = stableLeft;
    const changeCooldownMs = 300;
    if (now - lastChangedAt >= changeCooldownMs || previousCommand === 'CENTER' || direction === previousCommand) {
      return {
        direction,
        action: 'MOVE',
        dx: direction === 'LEFT' ? -1 : direction === 'RIGHT' ? 1 : 0,
        dy: direction === 'UP' ? -1 : direction === 'DOWN' ? 1 : 0,
      };
    }
    return {
      direction: previousCommand || direction,
      action: 'MOVE',
      dx: previousCommand === 'LEFT' ? -1 : previousCommand === 'RIGHT' ? 1 : 0,
      dy: previousCommand === 'UP' ? -1 : previousCommand === 'DOWN' ? 1 : 0,
    };
  }

  if (majority !== 'CENTER' && now >= graceUntil && isManualAgreement) {
    return {
      direction: majority,
      action: 'MOVE',
      dx: majority === 'LEFT' ? -1 : majority === 'RIGHT' ? 1 : 0,
      dy: majority === 'UP' ? -1 : majority === 'DOWN' ? 1 : 0,
    };
  }

  if (previousCommand && previousCommand !== 'CENTER' && now < graceUntil) {
    const prev = previousCommand;
    return {
      direction: prev,
      action: 'MOVE',
      dx: prev === 'LEFT' ? -1 : prev === 'RIGHT' ? 1 : 0,
      dy: prev === 'UP' ? -1 : prev === 'DOWN' ? 1 : 0,
    };
  }

  return { direction: 'CENTER', action: 'STOP', dx: 0, dy: 0 };
}

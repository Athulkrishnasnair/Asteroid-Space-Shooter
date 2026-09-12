import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDirectionalCommand } from './level2Consensus.js';

test('majority vote chooses left from noisy samples', () => {
  const result = resolveDirectionalCommand({
    p1Dir: 'LEFT',
    p2Dir: 'LEFT',
    p1Visible: true,
    p2Visible: true,
    history: ['LEFT', 'LEFT', 'LEFT', 'CENTER', 'LEFT'],
    previousCommand: 'CENTER',
    lastChangedAt: 0,
    now: 500,
    graceUntil: 0,
  });

  assert.equal(result.direction, 'LEFT');
  assert.equal(result.action, 'MOVE');
});

test('disagreement stops briefly even when one side is valid', () => {
  const result = resolveDirectionalCommand({
    p1Dir: 'LEFT',
    p2Dir: 'RIGHT',
    p1Visible: true,
    p2Visible: true,
    history: ['LEFT', 'RIGHT'],
    previousCommand: 'LEFT',
    lastChangedAt: 0,
    now: 100,
    graceUntil: 0,
  });

  assert.equal(result.action, 'STOP');
});

test('last command persists briefly after one player disappears', () => {
  const result = resolveDirectionalCommand({
    p1Dir: 'CENTER',
    p2Dir: 'CENTER',
    p1Visible: true,
    p2Visible: false,
    history: ['LEFT', 'LEFT', 'LEFT', 'LEFT'],
    previousCommand: 'LEFT',
    lastChangedAt: 0,
    now: 200,
    graceUntil: 700,
  });

  assert.equal(result.direction, 'LEFT');
  assert.equal(result.action, 'MOVE');
});

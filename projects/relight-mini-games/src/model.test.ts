import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialStudio, studioReducer, validSlots, testClaim, claims } from './model.ts';
test('placement preserves uniqueness and undo restores replaced scene', () => {
 let s = studioReducer(initialStudio, { type: 'place', id: 'camera', slot: 0 });
 s = studioReducer(s, { type: 'place', id: 'drums', slot: 1 });
 s = studioReducer(s, { type: 'place', id: 'camera', slot: 2 });
 assert.deepEqual(s.slots, [null, 'drums', 'camera']);
 s = studioReducer(s, { type: 'place', id: 'plant', slot: 1 });
 s = studioReducer(s, { type: 'undo' });
 assert.deepEqual(s.slots, [null, 'drums', 'camera']);
});
test('invalid persistence and out of range actions cannot corrupt slots', () => {
 assert.equal(validSlots(['camera', 'camera', null]), false);
 assert.equal(validSlots(['fake', null, null]), false);
 assert.equal(validSlots([null, 'plant', 'sketch']), true);
 assert.equal(studioReducer(initialStudio, { type: 'remove', slot: 4 }), initialStudio);
});
test('each claim has one intentional evidence interaction and other tools explain scope', () => {
 for (const c of claims) assert.equal(testClaim(c.id, c.tool)?.matches, true);
 assert.equal(testClaim('scent', 'evidence')?.matches, false);
 assert.equal(testClaim('missing', 'scope'), null);
});

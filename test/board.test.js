import assert from 'node:assert/strict'
import test from 'node:test'
import { addEdgeNails, drawnOutline, inOutline, newBoard, placementError, presets, removeNail, threadedNails, validOutline } from '../src/board.js'

const points = coordinates => coordinates.map(([x, z]) => ({ x, z }))

test('each preset supports spaced edge nails wholly on the board', () => {
  for (const preset of presets) {
    assert.ok(validOutline(preset.outline), preset.name)
    const nails = addEdgeNails(preset.outline, [])
    assert.ok(nails.length >= 12, preset.name)
    nails.forEach((nail, index) => assert.equal(placementError(nail, preset.outline, nails, index), '', preset.name))
  }
})

test('freehand fitting retains a concave edge and rejects crossed outlines', () => {
  const outline = drawnOutline(points([[-3, -2], [3, -2], [3, 2], [0, 0], [-3, 2]]))
  assert.ok(validOutline(outline))
  assert.ok(inOutline({ x: 2, z: 0 }, outline))
  assert.ok(!inOutline({ x: 0, z: 1.8 }, outline))
  assert.equal(drawnOutline(points([[-3, -2], [2, 2], [-3, 2], [3, -2]])), null)
})

test('nail placement checks the edge and spacing while moving an existing nail', () => {
  const { outline } = presets.find(preset => preset.id === 'square')
  const nails = points([[-2, 0], [1, 0]])
  assert.match(placementError({ x: 3.95, z: 0 }, outline, nails), /edge/)
  assert.match(placementError({ x: 1.2, z: 0 }, outline, nails), /space/)
  assert.equal(placementError({ x: 1.2, z: 0 }, outline, nails, 1), '')
})

test('removing an unused nail preserves the anchors of existing artwork', () => {
  const board = {
    ...newBoard(),
    nails: points([[-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0]]),
    strands: [{ anchor: 2, wraps: [{ to: 4 }, { to: 0 }] }],
  }
  assert.deepEqual(threadedNails(board), new Set([2, 4, 0]))
  assert.equal(removeNail(board, 2), board)
  assert.equal(removeNail(board, 4), board)
  const edited = removeNail(board, 1)
  const strand = edited.strands[0]
  assert.equal(edited.nails[strand.anchor], board.nails[2])
  assert.equal(edited.nails[strand.wraps[0].to], board.nails[4])
  assert.equal(edited.nails[strand.wraps[1].to], board.nails[0])
  assert.equal(board.nails.length, 5)
})

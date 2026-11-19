import assert from 'node:assert/strict'
import test from 'node:test'
import {
  atAngle, commitWrap, continuePull, countContacts, direction, FULL_TURN, GUIDE_RADIUS, movePull,
  starterBoard, startPull, tensionState, threadEnd, TAUT_MAX, TAUT_MIN, WRAP_RADIUS,
} from '../src/thread.js'

const board = starterBoard()
const { nails } = board
const strand = board.strands.at(-1)
const source = nails[threadEnd(strand)]
const contacts = countContacts(board)

function windingAt(index, wind = 1) {
  const target = nails[index]
  const angle = direction(target, source)
  const pull = startPull(strand, source, nails)
  const move = (point, reel) => movePull(pull, strand, point, contacts, reel)
  const orbit = (turn, radius = GUIDE_RADIUS) => atAngle(target, angle + turn * wind, radius)
  const approach = (radius = GUIDE_RADIUS) => {
    const near = orbit(0, radius)
    for (let step = 1; step <= 30; step++) {
      const fraction = step / 30
      assert.equal(move({ x: source.x + (near.x - source.x) * fraction, z: source.z + (near.z - source.z) * fraction }), false)
    }
  }
  const catchWithSlack = () => {
    move(atAngle(source, direction(source, target), 8))
    move(orbit(0))
    for (let turn = 0.1; turn < FULL_TURN; turn += 0.1) {
      assert.equal(move(orbit(turn)), false)
      assert.ok(!pull.candidate?.caught)
    }
    assert.equal(move(orbit(0)), false)
    assert.equal(pull.candidate?.caught, true)
  }
  return { pull, move, orbit, approach, catchWithSlack }
}

test('one full revolution in either direction sets a taut wrap on the intended nail', () => {
  for (let index = 1; index < nails.length; index++) {
    for (const wind of [-1, 1]) {
      for (const radius of [0.135, 0.2, GUIDE_RADIUS, 0.48]) {
        for (const [step, wobble] of [[0.11, 0], [0.47, 0.04], [0.11, 0.04]]) {
          const { pull, move, orbit, approach } = windingAt(index, wind)
          approach(radius)
          for (let turn = step; turn < FULL_TURN; turn += step) {
            assert.equal(move(orbit(turn, radius + wobble * Math.sin(turn * 4.5))), false)
            assert.ok(!pull.candidate?.caught)
          }
          assert.equal(move(orbit(FULL_TURN - 0.00001, radius)), false)
          assert.ok(!pull.candidate?.caught)
          assert.equal(move(orbit(0, radius)), true, `nail ${index}, wind ${wind}, radius ${radius}, step ${step}, wobble ${wobble}`)
          const wrap = commitWrap(pull)
          assert.equal(wrap.to, index, 'an adjacent nail captured the turn')
          assert.equal(wrap.sweep, FULL_TURN * wind)
          assert.ok(wrap.coilRise > 0)
          assert.ok(wrap.tension >= TAUT_MIN && wrap.tension <= TAUT_MAX)
          assert.ok(wrap.restLength > 0 && wrap.restLength < wrap.length)
        }
      }
    }
  }
})

test('straight and slightly shaky brushes do not catch or set a wrap', () => {
  for (const index of [1, 9, 16, 31]) {
    const target = nails[index]
    for (const skew of [-2.9, -1.7, -0.8, 0, 0.8, 1.7, 2.9]) {
      for (const offset of [-0.25, -0.18, -0.14, -0.12, 0, 0.12, 0.14, 0.18, 0.25]) {
        for (const shake of [0, 0.018]) {
          const { pull, move } = windingAt(index)
          const angle = direction(target, source) + skew
          for (let step = 0; step <= 64; step++) {
            const along = 0.8 - step * 0.025
            const side = offset + shake * Math.sin(step * 1.3)
            assert.equal(move({
              x: target.x + along * Math.cos(angle) - side * Math.sin(angle),
              z: target.z + along * Math.sin(angle) + side * Math.cos(angle),
            }), false)
            assert.ok(!pull.candidate?.caught)
          }
        }
      }
    }
  }
})

test('short curves, reversals, and center cuts cannot set a wrap', () => {
  const { pull, move, orbit, approach } = windingAt(9)
  approach()
  for (let i = 1; i <= 10; i++) assert.equal(move(orbit(i * 0.12)), false)
  for (let i = 9; i >= 0; i--) assert.equal(move(orbit(i * 0.12)), false)
  assert.ok(pull.candidate.progress < 0.01)
  for (let i = 1; i <= 10; i++) assert.equal(move(orbit(i * 0.12)), false)
  assert.equal(move(orbit(1.2 + Math.PI)), false)
  assert.equal(pull.candidate.turn, 0)
  assert.equal(move(orbit(1.2), true), false)
  assert.ok(!pull.candidate.caught)
})

test('backtracking subtracts from the current revolution even after more than 360 degrees of travel', () => {
  const { pull, move, orbit, approach } = windingAt(9)
  approach()
  for (let angle = 0.2; angle <= 4; angle += 0.2) assert.equal(move(orbit(angle)), false)
  for (let angle = 3.8; angle >= 1.4; angle -= 0.2) assert.equal(move(orbit(angle)), false)
  for (let angle = 1.6; angle < 6.2; angle += 0.2) assert.equal(move(orbit(angle)), false)
  assert.equal(move(orbit(FULL_TURN - 0.001), true), false)
  assert.ok(!pull.candidate.caught)
  assert.equal(move(orbit(0)), true)
})

test('a slack catch holds its nail while the player moves and sets when the slack is taken up', () => {
  const { pull, move, orbit, catchWithSlack } = windingAt(9)
  catchWithSlack()
  const route = pull.candidate.route
  assert.equal(tensionState(pull.tension), 'Slack')
  assert.equal(move(nails[9]), false)
  assert.equal(move(orbit(0, 0.9)), false)
  assert.equal(pull.candidate.route, route)
  assert.equal(move(orbit(0, 0.9), true), true)
  assert.equal(commitWrap(pull).to, 9)
})

test('a caught wrap stays on the nail if pulled too tight and sets when eased inward', () => {
  const { pull, move, orbit, catchWithSlack } = windingAt(9)
  catchWithSlack()
  assert.equal(move(orbit(0, 4)), false)
  assert.equal(tensionState(pull.tension), 'Too tight')
  assert.equal(pull.candidate.index, 9)
  assert.equal(move(orbit(0, 1.7)), true)
  assert.equal(tensionState(pull.tension), 'Taut')
})

test('the set wrap keeps tangent spans and hands off the same loaded lead', () => {
  const target = nails[9]
  const { pull, move, orbit, approach } = windingAt(9, -1)
  approach()
  for (let angle = 0.1; angle < FULL_TURN; angle += 0.1) assert.equal(move(orbit(angle)), false)
  assert.equal(move(orbit(0)), true)
  const wrap = commitWrap(pull)
  const departure = atAngle(source, wrap.exitAngle, WRAP_RADIUS)
  const arrival = atAngle(target, wrap.entryAngle, WRAP_RADIUS)
  const tangentDot = (start, finish, center, contact) =>
    (finish.x - start.x) * (contact.x - center.x) + (finish.z - start.z) * (contact.z - center.z)
  assert.ok(Math.abs(tangentDot(departure, arrival, source, departure)) < 1e-10)
  assert.ok(Math.abs(tangentDot(departure, arrival, target, arrival)) < 1e-10)
  const next = { ...strand, wraps: [...strand.wraps, wrap] }
  const lead = continuePull(next, pull.hand, wrap.tension, nails)
  assert.equal(lead.start, wrap.to)
  assert.equal(tensionState(lead.tension), 'Taut')
  assert.equal(lead.free.fromArc, pull.candidate.lead.arc)
  assert.equal(lead.length, pull.candidate.lead.length)
})

import { newBoard, roundNails } from './board.js'

export const WRAP_RADIUS = 0.073
export const GRIP_RADIUS = 0.36
export const GUIDE_RADIUS = 0.33
export const RELEASE_RADIUS = 0.55
export const FULL_TURN = 2 * Math.PI
export const TAUT_MIN = 0.43
export const TAUT_MAX = 0.88
export const FEED_TENSION = 0.63

const AIM_RADIUS = 0.50
const WIND_RADIUS = 0.69
const INNER_RADIUS = 0.092
const TURN_EPSILON = 1e-8
const COIL_RISE = 0.022

export const palette = [
  { name: 'Persimmon', color: '#cb4b34' },
  { name: 'Marigold', color: '#c18e31' },
  { name: 'Moss', color: '#69744c' },
  { name: 'Ink', color: '#394d66' },
  { name: 'Plum', color: '#77536c' },
  { name: 'Linen', color: '#e2cda8' },
]

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

export function direction(a, b) {
  return Math.atan2(b.z - a.z, b.x - a.x)
}

export function atAngle(center, angle, radius) {
  return { x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius }
}

function angleDifference(angle, previous) {
  return Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous))
}

export function nearestNail(point, nails, radius = GRIP_RADIUS) {
  let best = radius
  let hit = -1
  nails.forEach((nail, index) => {
    const separation = distance(point, nail)
    if (separation <= best) {
      best = separation
      hit = index
    }
  })
  return hit
}

export function threadEnd(strand) {
  return strand.wraps.at(-1)?.to ?? strand.anchor
}

function tangentOffset(radius) {
  return Math.acos(Math.min(1, WRAP_RADIUS / Math.max(WRAP_RADIUS, radius)))
}

function altitude(layer) {
  return 0.099 + 0.012 * Math.min(11, layer)
}

export function countContacts(board) {
  const counts = Array(board.nails.length).fill(0)
  for (const strand of board.strands) {
    counts[strand.anchor]++
    for (const wrap of strand.wraps) counts[wrap.to]++
  }
  return counts
}

function sourceContact(strand) {
  const last = strand.wraps.at(-1)
  return last
    ? { angle: last.entryAngle + last.sweep, wind: Math.sign(last.sweep), y: last.toY }
    : { angle: null, wind: 1, y: altitude(strand.anchorLayer) }
}

function departureArc(contact, exitAngle) {
  if (contact.angle === null) return 0
  return angleDifference(exitAngle, contact.angle)
}

function tangentRoute(strand, to, wind, layer, nails) {
  const from = nails[threadEnd(strand)]
  const target = nails[to]
  const contact = sourceContact(strand)
  // Equal-radius circles share an outer tangent, or an inner tangent when the wind reverses.
  const heading = direction(from, target) - Math.asin((wind - contact.wind) * WRAP_RADIUS / distance(from, target))
  const exitAngle = heading - contact.wind * Math.PI / 2
  const entryAngle = heading - wind * Math.PI / 2
  const fromArc = departureArc(contact, exitAngle)
  const exit = atAngle(from, exitAngle, WRAP_RADIUS)
  const entry = atAngle(target, entryAngle, WRAP_RADIUS)
  return {
    to, exitAngle, entryAngle, fromArc, fromAngle: contact.angle,
    fromY: contact.y, toY: altitude(layer), layer,
    length: distance(exit, entry) + WRAP_RADIUS * Math.abs(fromArc),
  }
}

function freeRoute(strand, hand, nails) {
  const from = nails[threadEnd(strand)]
  const contact = sourceContact(strand)
  const lead = leadRoute(from, hand, contact.angle, contact.wind)
  return {
    exitAngle: lead.exitAngle, fromArc: lead.arc, fromAngle: contact.angle, fromY: contact.y, length: lead.length,
  }
}

function leadRoute(nail, hand, contact, wind) {
  const radius = distance(nail, hand)
  const bearing = direction(nail, hand)
  const offset = tangentOffset(radius)
  let exitAngle = bearing - wind * offset
  if (contact !== null) {
    const bias = angleDifference(contact, bearing)
    // Keep the last contact while the hand has a clear line away from the shaft.
    exitAngle = radius <= WRAP_RADIUS || Math.abs(bias) <= offset ? contact : bearing + Math.sign(bias) * offset
  }
  const arc = contact === null ? 0 : angleDifference(exitAngle, contact)
  return {
    exitAngle, arc,
    length: distance(atAngle(nail, exitAngle, WRAP_RADIUS), hand) + WRAP_RADIUS * Math.abs(arc),
  }
}

function allowance(length) {
  return Math.min(0.72 + length * 0.034, 0.035 + length * 1.55)
}

export function startPull(strand, hand, nails) {
  return startWithTension(strand, hand, nails, 0, false)
}

export function continuePull(strand, hand, tension, nails) {
  return startWithTension(strand, hand, nails, Math.min(tension, FEED_TENSION), true)
}

function startWithTension(strand, hand, nails, tension, preserveTension) {
  const free = freeRoute(strand, hand, nails)
  const payout = preserveTension ? Math.max(0, free.length - allowance(free.length) * tension) : 0
  return {
    hand, free, payout, nails, candidate: null, traces: new Map(), length: free.length, start: threadEnd(strand),
    tension: preserveTension ? (free.length - payout) / allowance(free.length) : tension,
  }
}

function passesThroughCenter(previous, point, center) {
  const dx = point.x - previous.x
  const dz = point.z - previous.z
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared === 0) return false
  const t = ((center.x - previous.x) * dx + (center.z - previous.z) * dz) / lengthSquared
  if (t <= 0 || t >= 1) return false
  return distance({ x: previous.x + t * dx, z: previous.z + t * dz }, center) < INNER_RADIUS
}

function aimAt(index, angle) {
  return {
    index, angle, startAngle: angle, turn: 0, progress: 0, caught: false, route: null, engagement: 0,
  }
}

function traceTurn(candidate, nail, previous, point, radius) {
  const angle = direction(nail, point)
  if (radius < INNER_RADIUS || passesThroughCenter(previous, point, nail)) return aimAt(candidate.index, null)
  if (candidate.angle === null) return aimAt(candidate.index, angle)

  const delta = angleDifference(angle, candidate.angle)
  if (candidate.turn === 0) {
    const previousRadius = distance(nail, previous)
    const tangentialTravel = Math.abs(delta) * (radius + previousRadius) / 2
    if (tangentialTravel <= Math.abs(radius - previousRadius) * 0.48) return aimAt(candidate.index, angle)
  }

  // Count net revolutions. Reversing direction unwinds the preview.
  candidate.turn += delta
  candidate.angle = angle
  const wound = Math.abs(candidate.turn)
  candidate.progress = wound >= FULL_TURN - TURN_EPSILON ? 1 : wound / FULL_TURN
  if (wound < TURN_EPSILON) return aimAt(candidate.index, angle)
  return candidate
}

function trackCandidate(pull, point) {
  if (pull.candidate?.caught) return pull.candidate

  let best = null
  let score = -Infinity
  for (const [index, nail] of pull.nails.entries()) {
    if (index === pull.start) continue
    const radius = distance(nail, point)
    const previous = pull.traces.get(index)
    if (radius > (previous ? WIND_RADIUS : AIM_RADIUS)) {
      pull.traces.delete(index)
      continue
    }
    const trace = previous
      ? traceTurn(previous, nail, pull.hand, point, radius)
      : aimAt(index, radius < INNER_RADIUS ? null : direction(nail, point))
    pull.traces.set(index, trace)
    const continuity = index === pull.candidate?.index && trace.progress > 0.12 ? 0.09 : 0
    const rank = trace.progress === 1 ? 2 - radius : trace.progress - radius * 0.38 + continuity
    if (rank > score) {
      best = trace
      score = rank
    }
  }
  return best
}

function windingRoute(strand, candidate, layer, engagement, nails) {
  if (candidate.caught) return candidate.route
  if (candidate.angle === null || engagement === 0) return null
  const wind = Math.sign(candidate.turn)
  const route = tangentRoute(strand, candidate.index, wind, layer, nails)
  const sweep = candidate.progress * FULL_TURN
  route.sweep = wind * sweep
  route.coilRise = COIL_RISE * candidate.progress
  route.length += Math.hypot(WRAP_RADIUS * sweep, route.coilRise)
  return route
}

export function movePull(pull, strand, point, contacts, reel = false) {
  const candidate = trackCandidate(pull, point)
  const wasCaught = candidate?.caught
  pull.candidate = candidate
  pull.hand = point
  pull.free = freeRoute(strand, point, pull.nails)
  let length = pull.free.length
  if (candidate) {
    const blend = Math.min(1, Math.max(0, (candidate.progress - 0.20) / 0.75))
    const engagement = blend * blend * (3 - 2 * blend)
    const route = windingRoute(strand, candidate, contacts[candidate.index], engagement, pull.nails)
    candidate.route = route
    candidate.engagement = engagement
    if (route) {
      const lead = leadRoute(pull.nails[candidate.index], point, route.entryAngle + route.sweep, Math.sign(route.sweep))
      candidate.lead = lead
      length += (route.length + lead.length - length) * engagement
    }
    candidate.caught = candidate.progress === 1
  }

  const stretchRange = allowance(length)
  // Take up a little feed on the catch. Larger slack still needs a pull.
  if (!wasCaught) {
    const desired = Math.max(0, length - stretchRange * FEED_TENSION)
    const takeUp = candidate?.caught ? 0.16 : 0
    pull.payout = Math.max(desired, pull.payout - takeUp)
  }
  if (reel) pull.payout = Math.max(0, length - stretchRange * FEED_TENSION)
  pull.length = length
  pull.tension = Math.max(0, (length - pull.payout) / stretchRange)
  return Boolean(candidate?.caught && pull.tension >= TAUT_MIN && pull.tension <= TAUT_MAX)
}

export function commitWrap(pull) {
  const { route, lead } = pull.candidate
  return {
    ...route,
    tension: pull.tension,
    restLength: route.length * Math.min(1, pull.payout / (route.length + lead.length)),
  }
}

export function makeStrand(board) {
  return {
    color: board.color,
    anchor: 0,
    anchorLayer: 0,
    wraps: [],
    tied: false,
  }
}

export function starterBoard() {
  const board = { ...newBoard(), name: 'Rosette study', nails: roundNails }
  const contacts = countContacts(board)
  const pattern = [
    { color: 1, start: 4, step: 7, tied: true },
    { color: 0, start: 0, step: 13, tied: false },
  ]

  for (const { color, start, step, tied } of pattern) {
    const strand = { color, anchor: start, anchorLayer: contacts[start]++, wraps: [], tied }
    for (let index = 1; index <= roundNails.length; index++) {
      const nail = (start + index * step) % roundNails.length
      const route = tangentRoute(strand, nail, 1, contacts[nail]++, roundNails)
      const sweep = Math.PI * 0.55 + 0.08
      const length = route.length + WRAP_RADIUS * sweep
      strand.wraps.push({ ...route, sweep, length, tension: FEED_TENSION, restLength: length - allowance(length) * FEED_TENSION })
    }
    board.strands.push(strand)
  }
  return board
}

export function tensionState(tension) {
  if (tension < TAUT_MIN) return 'Slack'
  if (tension > TAUT_MAX) return 'Too tight'
  return 'Taut'
}

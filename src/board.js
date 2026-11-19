export const MAX_NAILS = 160
export const NAIL_SPACING = 0.48
export const EDGE_CLEARANCE = 0.20
const OUTLINE_LIMIT = 360
const BOARD_SIZE = 8
const TAU = Math.PI * 2

function gap(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function edgeDistance(point, a, b) {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const lengthSquared = dx * dx + dz * dz
  if (!lengthSquared) return gap(point, a)
  const projection = ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared
  const t = Math.max(0, Math.min(1, projection))
  return Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t)
}

function signedArea(outline) {
  let area = 0
  for (let i = 0; i < outline.length; i++) {
    const { x, z } = outline[i]
    const next = outline[(i + 1) % outline.length]
    area += x * next.z - z * next.x
  }
  return area / 2
}

function centerAndSize(points) {
  const minX = Math.min(...points.map(point => point.x))
  const maxX = Math.max(...points.map(point => point.x))
  const minZ = Math.min(...points.map(point => point.z))
  const maxZ = Math.max(...points.map(point => point.z))
  const scale = BOARD_SIZE / Math.max(maxX - minX, maxZ - minZ)
  return points.map(({ x, z }) => ({ x: (x - (minX + maxX) / 2) * scale, z: (z - (minZ + maxZ) / 2) * scale }))
}

function polar(count, radius) {
  return Array.from({ length: count }, (_, index) => {
    const angle = index / count * TAU - Math.PI / 2
    const [x, z] = radius(angle, index)
    return { x: Math.cos(angle) * x, z: Math.sin(angle) * z }
  })
}

function polygon(points) {
  return centerAndSize(points.map(([x, z]) => ({ x, z })))
}

const roundOutline = polar(112, () => [4.16, 4.16])
export const roundNails = polar(32, () => [3.72, 3.72])

export const presets = [
  { id: 'round', name: 'Round', outline: roundOutline },
  { id: 'square', name: 'Square', outline: polygon([[-1, -1], [1, -1], [1, 1], [-1, 1]]) },
  { id: 'oval', name: 'Oval', outline: polar(96, () => [4, 2.65]) },
  { id: 'hexagon', name: 'Hexagon', outline: polar(6, () => [4, 4]) },
  { id: 'heart', name: 'Heart', outline: centerAndSize(Array.from({ length: 72 }, (_, index) => {
    const t = index / 72 * TAU
    return {
      x: 16 * Math.sin(t) ** 3,
      z: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
    }
  })) },
  { id: 'star', name: 'Star', outline: polar(10, (_, index) => index % 2 ? [1.94, 1.94] : [4.15, 4.15]) },
  { id: 'texas', name: 'Texas', outline: polygon([
    [.32, 0], [.54, 0], [.54, .24], [.65, .27], [.74, .25], [.82, .32], [.92, .34], [.94, .46],
    [.98, .55], [.95, .62], [.84, .66], [.77, .73], [.68, .84], [.66, .96], [.59, .94], [.53, .86],
    [.46, .73], [.38, .65], [.31, .65], [.28, .71], [.19, .65], [.13, .55], [0, .43], [.32, .43],
  ]) },
  { id: 'california', name: 'California', outline: polygon([
    [.04, 0], [.32, 0], [.32, .37], [.59, .68], [.56, .78], [.58, .88], [.5, .94], [.33, .92],
    [.30, .83], [.26, .76], [.19, .72], [.16, .65], [.10, .59], [.09, .51], [.05, .47],
    [.065, .39], [.015, .31], [.04, .24], [0, .15], [.02, .08],
  ]) },
]

export function newBoard() {
  return { name: 'Untitled piece', preset: 'round', outline: roundOutline, nails: [], color: 0, strands: [] }
}

export function boardName(id) {
  return presets.find(preset => preset.id === id)?.name ?? 'Custom'
}

export function inOutline(point, outline, margin = 0) {
  let inside = false
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    if (margin && edgeDistance(point, a, b) < margin) return false
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) {
      inside = !inside
    }
  }
  return inside
}

export function placementError(point, outline, nails, moving = -1) {
  if (!inOutline(point, outline, EDGE_CLEARANCE)) return 'Place the nail on the wood with a little room from the edge.'
  if (nails.some((nail, index) => index !== moving && gap(nail, point) < NAIL_SPACING)) return 'Leave a little more space between nails.'
  if (moving === -1 && nails.length >= MAX_NAILS) return 'This board has reached the nail limit.'
  return ''
}

export function threadedNails(board) {
  const used = new Set()
  for (const strand of board.strands) {
    used.add(strand.anchor)
    for (const wrap of strand.wraps) used.add(wrap.to)
  }
  return used
}

export function removeNail(board, index) {
  if (!board.nails[index] || threadedNails(board).has(index)) return board
  const shift = i => i > index ? i - 1 : i
  return {
    ...board,
    nails: board.nails.filter((_, i) => i !== index),
    strands: board.strands.map(strand => ({
      ...strand, anchor: shift(strand.anchor),
      wraps: strand.wraps.map(wrap => wrap.to > index ? { ...wrap, to: wrap.to - 1 } : wrap),
    })),
  }
}

export function addEdgeNails(outline, nails) {
  const next = [...nails]
  const lengths = outline.map((point, i) => gap(point, outline[(i + 1) % outline.length]))
  const perimeter = lengths.reduce((sum, length) => sum + length, 0)
  const count = Math.round(perimeter / 0.79)
  const inward = Math.sign(signedArea(outline))
  let segment = 0
  let traversed = 0
  for (let slot = 0; slot < count; slot++) {
    const offset = perimeter * (slot + 0.5) / count
    while (offset > traversed + lengths[segment]) traversed += lengths[segment++]
    const a = outline[segment]
    const b = outline[(segment + 1) % outline.length]
    const dx = (b.x - a.x) / lengths[segment]
    const dz = (b.z - a.z) / lengths[segment]
    const along = offset - traversed
    for (const inset of [0.34, 0.48, 0.64]) {
      const point = { x: a.x + dx * along - dz * inset * inward, z: a.z + dz * along + dx * inset * inward }
      if (!placementError(point, outline, next)) {
        next.push(point)
        break
      }
    }
  }
  return next
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
}

function segmentsCross(a, b, c, d) {
  const eps = 1e-6
  const u = cross(a, b, c)
  const v = cross(a, b, d)
  const w = cross(c, d, a)
  const y = cross(c, d, b)
  if (u * v < -eps * eps && w * y < -eps * eps) return true
  return (Math.abs(u) < eps && edgeDistance(c, a, b) < eps)
    || (Math.abs(v) < eps && edgeDistance(d, a, b) < eps)
    || (Math.abs(w) < eps && edgeDistance(a, c, d) < eps)
    || (Math.abs(y) < eps && edgeDistance(b, c, d) < eps)
}

export function validOutline(outline) {
  if (!Array.isArray(outline) || outline.length < 3 || outline.length > OUTLINE_LIMIT
    || !outline.every(point => point && Number.isFinite(point.x) && Number.isFinite(point.z)
      && Math.abs(point.x) <= 4.25 && Math.abs(point.z) <= 4.25)
    || Math.abs(signedArea(outline)) < 0.15) return false
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    if (gap(a, b) < 0.001) return false
    for (let j = i + 2; j < outline.length; j++) {
      if (i === 0 && j === outline.length - 1) continue
      if (segmentsCross(a, b, outline[j], outline[(j + 1) % outline.length])) return false
    }
  }
  return true
}

function simplify(points, tolerance) {
  const first = points[0]
  const last = points.at(-1)
  let farthest = tolerance
  let split = 0
  for (let i = 1; i < points.length - 1; i++) {
    const distance = edgeDistance(points[i], first, last)
    if (distance > farthest) {
      split = i
      farthest = distance
    }
  }
  if (!split) return [first, last]
  return [...simplify(points.slice(0, split + 1), tolerance).slice(0, -1), ...simplify(points.slice(split), tolerance)]
}

export function drawnOutline(points) {
  if (points.length < 3 || Math.abs(signedArea(points)) < 0.24) return null
  const clean = simplify([...points, points[0]], 0.047).slice(0, -1)
  if (clean.length < 3) return null
  const outline = centerAndSize(clean)
  return validOutline(outline) ? outline : null
}

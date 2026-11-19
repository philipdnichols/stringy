import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { MAX_NAILS } from './board.js'
import { atAngle, distance, GUIDE_RADIUS, palette, threadEnd, WRAP_RADIUS } from './thread.js'

const SHADOW_SIZE = 11.6
const THREAD_RADIUS = 0.025
const POINTER_HEIGHT = 0.27
const TAU = Math.PI * 2

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d'), width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function woodTexture() {
  return canvasTexture(1024, 1024, (context, width, height) => {
    const image = context.createImageData(width, height)
    const channels = image.data
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4
        const bend = 17 * Math.sin(x / 154 + y / 230) + 10 * Math.cos(x / 261 - y / 165)
        const grain = y + bend + 2 * Math.sin(x / 35 + y / 17)
        const growth = Math.sin(grain * 0.086 + Math.sin(grain * 0.024) * 2.55)
        const ring = Math.pow(Math.max(0, growth), 13) * -17
        const fiber = Math.sin(grain * 1.71) * 2 + Math.cos(grain * 2.64 + x / 43) * 2
        const grainFine = ((x * 1597334677 ^ y * 3812015801) >>> 20) % 13 - 6
        const grainTone = ring + growth * 4 + fiber + grainFine * 0.34
        const tone = Math.sin(y * 0.031 + Math.cos(x / 388)) * 5 + Math.cos(grain * 0.054) * 4
        channels[offset] = 184 + tone + grainTone
        channels[offset + 1] = 122 + tone * 0.79 + grainTone * 0.72
        channels[offset + 2] = 74 + tone * 0.65 + grainTone * 0.60
        channels[offset + 3] = 255
      }
    }

    context.putImageData(image, 0, 0)
    let seed = 81279
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    for (let index = 0; index < 2000; index++) {
      const x = random() * width
      const y = random() * height
      const length = 3 + random() * 100
      context.strokeStyle = random() < 0.75 ? 'rgba(77,36,15,0.12)' : 'rgba(255,206,138,0.15)'
      context.lineWidth = 0.35 + random() * 0.7
      context.beginPath()
      context.moveTo(x, y)
      context.quadraticCurveTo(x + length * 0.6, y + Math.cos(x / 154 + y / 230) * length * 0.05, x + length, y + Math.cos(x / 154 + y / 230) * length * 0.09)
      context.stroke()
    }
  })
}

function contactShadow(outline) {
  return canvasTexture(256, 256, (context, width) => {
    context.beginPath()
    outline.forEach(({ x, z }, index) => {
      const sx = width * (x / SHADOW_SIZE + 0.5)
      const sy = width * (z / SHADOW_SIZE + 0.5)
      if (index === 0) context.moveTo(sx, sy)
      else context.lineTo(sx, sy)
    })
    context.closePath()
    context.filter = 'blur(10px)'
    context.fillStyle = 'rgba(69,41,21,0.45)'
    context.fill()
    context.filter = 'blur(3px)'
    context.fillStyle = 'rgba(69,41,21,0.20)'
    context.fill()
  })
}

function boardGeometry(outline) {
  const shape = new THREE.Shape(outline.map(({ x, z }) => new THREE.Vector2(x, -z)))
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.29, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.034, bevelSegments: 2,
  })
  const uv = geometry.getAttribute('uv')
  for (const { start, count, materialIndex } of geometry.groups) {
    if (materialIndex !== 0) continue
    for (let i = start; i < start + count; i++) uv.setXY(i, uv.getX(i) / 8.6 + 0.5, uv.getY(i) / 8.6 + 0.5)
  }
  return geometry
}

function flatGeometry(geometry, y, material) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = y
  return mesh
}

function pushPoint(points, x, y, z) {
  const previous = points.at(-1)
  if (!previous || Math.abs(previous.x - x) + Math.abs(previous.y - y) + Math.abs(previous.z - z) > 0.0001) {
    points.push(new THREE.Vector3(x, y, z))
  }
}

function arc(points, nail, start, sweep, y, lift = 0) {
  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / 0.21))
  for (let step = 0; step <= steps; step++) {
    const fraction = step / steps
    const angle = start + sweep * fraction
    const point = atAngle(nail, angle, WRAP_RADIUS)
    pushPoint(points, point.x, y + lift * fraction, point.z)
  }
}

function crossing(a, b) {
  const ax = a.to.x - a.from.x
  const az = a.to.z - a.from.z
  const bx = b.to.x - b.from.x
  const bz = b.to.z - b.from.z
  const determinant = ax * bz - az * bx
  if (Math.abs(determinant) < 0.025) return null
  const dx = b.from.x - a.from.x
  const dz = b.from.z - a.from.z
  const t = (dx * bz - dz * bx) / determinant
  const u = (dx * az - dz * ax) / determinant
  return t > 0.04 && t < 0.96 && u > 0.04 && u < 0.96 ? { t, u } : null
}

function chordHeight(span, fraction) {
  const sag = (0.008 + 0.18 * span.slack) * Math.sin(Math.PI * fraction)
  let rise = 0
  for (const peak of span.peaks) {
    const offset = (fraction - peak.fraction) / peak.width
    if (Math.abs(offset) < 1) rise = Math.max(rise, peak.height * (1 - offset * offset) ** 2)
  }
  return Math.max(0.037, THREE.MathUtils.lerp(span.startY, span.endY, fraction) - sag) + rise
}

function describeChord(from, to, startY, endY, slack = 0, earlier = []) {
  const span = { from, to, startY, endY, slack, peaks: [] }
  const length = distance(from, to)
  if (slack > 0.18) return span
  for (const previous of earlier) {
    const hit = crossing(span, previous)
    if (!hit) continue
    const base = THREE.MathUtils.lerp(startY, endY, hit.t) - (0.008 + 0.18 * slack) * Math.sin(Math.PI * hit.t)
    const clearance = Math.min(0.29, base + 0.075, chordHeight(previous, hit.u) + 2 * THREAD_RADIUS + 0.006)
    if (clearance > base + 0.004) {
      span.peaks.push({ fraction: hit.t, width: Math.min(hit.t, 1 - hit.t, 0.48 / length), height: clearance - base })
    }
  }
  return span
}

function chord(points, span) {
  const { from, to, slack, peaks } = span
  const steps = Math.max(5, Math.ceil(distance(from, to) * 3.5))
  const angle = Math.atan2(to.z - from.z, to.x - from.x) + Math.PI / 2
  const bow = Math.min(1.3, distance(from, to) * 0.29) * slack
  const fractions = Array.from({ length: steps + 1 }, (_, step) => step / steps)
  for (const peak of peaks) fractions.push(peak.fraction)
  fractions.sort((a, b) => a - b)
  for (const fraction of fractions) {
    const bend = Math.sin(Math.PI * fraction)
    pushPoint(
      points,
      THREE.MathUtils.lerp(from.x, to.x, fraction) + Math.cos(angle) * bow * bend,
      chordHeight(span, fraction),
      THREE.MathUtils.lerp(from.z, to.z, fraction) + Math.sin(angle) * bow * bend,
    )
  }
}

function wrapChord(from, to, wrap, slack, earlier) {
  const lift = wrap.fromArc ? 0.021 : 0
  return describeChord(
    atAngle(from, wrap.exitAngle, WRAP_RADIUS),
    atAngle(to, wrap.entryAngle, WRAP_RADIUS),
    wrap.fromY + lift, wrap.toY - (wrap.coilRise ?? 0), slack, earlier,
  )
}

function wrapPoints(from, to, wrap, span) {
  const points = []
  const departureLift = wrap.fromArc ? 0.021 : 0
  arc(points, from, wrap.fromAngle ?? wrap.exitAngle, wrap.fromArc, wrap.fromY, departureLift)
  chord(points, span)
  const coilRise = wrap.coilRise ?? 0
  arc(points, to, wrap.entryAngle, wrap.sweep, wrap.toY - coilRise, coilRise)
  return points
}

function threadGeometry(points, radius = THREAD_RADIUS) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.max(12, points.length * 2), radius, 7, false)
}

function blendPaths(from, to, engagement) {
  const steps = Math.max(from.length, to.length)
  const straight = new THREE.CatmullRomCurve3(from).getSpacedPoints(steps)
  const wrapped = new THREE.CatmullRomCurve3(to).getSpacedPoints(steps)
  return straight.map((point, index) => point.lerp(wrapped[index], engagement))
}

function knotGeometry(nail, layer, angle) {
  const points = []
  const y = 0.102 + 0.012 * Math.min(11, layer)
  for (let step = 0; step <= 64; step++) {
    const fraction = step / 64
    const point = atAngle(nail, angle + fraction * TAU * 1.58, WRAP_RADIUS + 0.013 * Math.sin(Math.PI * fraction))
    pushPoint(points, point.x, y + fraction * 0.04, point.z)
  }
  const end = atAngle(nail, angle + TAU * 1.58, 0.155)
  pushPoint(points, end.x, y + 0.034, end.z)
  return threadGeometry(points, 0.027)
}

export class Workbench {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.98
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap

    this.scene = new THREE.Scene()
    const environment = new RoomEnvironment()
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(environment, 0.05).texture
    this.scene.environmentIntensity = 0.52
    environment.dispose()
    pmrem.dispose()

    this.camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 70)
    this.camera.position.set(0, 16.4, 9.2)
    this.camera.lookAt(0, -0.07, 0)
    this.raycaster = new THREE.Raycaster()
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -POINTER_HEIGHT)
    this.zoom = 1

    this.scene.add(new THREE.HemisphereLight('#fff3e0', '#c69e82', 1.15))
    const key = new THREE.DirectionalLight('#fff3df', 1.65)
    key.position.set(-4.8, 10, -4.7)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 24 })
    key.shadow.bias = -0.00014
    key.shadow.normalBias = 0.016
    this.scene.add(key)
    const fill = new THREE.DirectionalLight('#e9efff', 0.7)
    fill.position.set(4, 6, 6)
    this.scene.add(fill)

    const wood = woodTexture()
    wood.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    const side = wood.clone()
    side.repeat.set(3, 0.25)
    side.wrapS = THREE.RepeatWrapping
    side.needsUpdate = true
    side.wrapT = THREE.RepeatWrapping
    this.shadow = flatGeometry(new THREE.PlaneGeometry(SHADOW_SIZE, SHADOW_SIZE), -0.36, new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, toneMapped: false,
    }))
    this.shadow.position.set(0.14, -0.36, 0.21)
    this.shadow.visible = false
    this.scene.add(this.shadow)

    this.surface = flatGeometry(new THREE.BufferGeometry(), -0.315, [
      new THREE.MeshStandardMaterial({ map: wood, bumpMap: wood, bumpScale: 0.035, roughness: 0.73, envMapIntensity: 0.48 }),
      new THREE.MeshStandardMaterial({ color: '#bf976c', map: side, bumpMap: side, bumpScale: 0.032, roughness: 0.74 }),
    ])
    this.surface.receiveShadow = true
    this.scene.add(this.surface)

    const heads = new THREE.InstancedMesh(new THREE.LatheGeometry([
      [0, 0.291], [0.087, 0.291], [0.101, 0.303], [0.101, 0.331],
      [0.091, 0.346], [0.062, 0.354], [0, 0.354],
    ].map(([radius, y]) => new THREE.Vector2(radius, y)), 24), new THREE.MeshStandardMaterial({
      color: '#b6b0a5', metalness: 0.78, roughness: 0.32, envMapIntensity: 1.42,
    }), MAX_NAILS)
    const shafts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.053, 0.046, 0.295, 12), new THREE.MeshStandardMaterial({
      color: '#777168', metalness: 0.72, roughness: 0.41,
    }), MAX_NAILS)
    const holes = new THREE.InstancedMesh(new THREE.CircleGeometry(0.085, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
      color: '#62371f',
    }), MAX_NAILS)
    this.nailMeshes = [[holes, 0.001], [shafts, 0.148], [heads, 0]]
    this.nails = []
    for (const [mesh] of this.nailMeshes) mesh.count = 0
    heads.castShadow = true
    shafts.castShadow = true
    this.scene.add(holes, shafts, heads)

    this.threadMaterials = palette.map(({ color }) => new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.065, roughness: 0.9, envMapIntensity: 0.35,
    }))
    this.committed = new THREE.Group()
    this.scene.add(this.committed)
    this.chords = []
    this.chordCache = new WeakMap()
    this.liveMaterial = new THREE.MeshStandardMaterial({ roughness: 0.84, envMapIntensity: 0.29, transparent: true })
    this.live = new THREE.Mesh(new THREE.BufferGeometry(), this.liveMaterial)
    this.live.castShadow = true
    this.live.visible = false
    this.scene.add(this.live)
    this.guide = new THREE.Group()
    this.guideBase = flatGeometry(new THREE.RingGeometry(GUIDE_RADIUS - 0.01, GUIDE_RADIUS + 0.01, 64), 0, new THREE.MeshBasicMaterial({
      color: '#fff3d9', transparent: true, opacity: 0.52, depthWrite: false,
    }))
    this.guideFill = flatGeometry(new THREE.BufferGeometry(), 0.003, new THREE.MeshBasicMaterial({
      color: '#fff3d9', transparent: true, opacity: 0.94, depthWrite: false,
    }))
    this.guideStart = flatGeometry(new THREE.CircleGeometry(0.048, 24), 0.006, new THREE.MeshBasicMaterial({
      color: '#fff3d9', depthWrite: false,
    }))
    this.guide.add(this.guideBase, this.guideFill, this.guideStart)
    this.guide.visible = false
    this.scene.add(this.guide)
  }

  resize(width, height, zoom = this.zoom) {
    this.zoom = zoom
    this.width = width
    this.height = height
    this.renderer.setSize(width, height, false)
    const aspect = width / height
    const vertical = Math.max(8.67, 9.32 / aspect) / zoom
    this.camera.left = -vertical * aspect / 2
    this.camera.right = vertical * aspect / 2
    this.camera.top = vertical / 2
    this.camera.bottom = -vertical / 2
    this.camera.updateProjectionMatrix()
    this.draw()
  }

  point(clientX, clientY) {
    const bounds = this.canvas.getBoundingClientRect()
    this.raycaster.setFromCamera(new THREE.Vector2(
      (clientX - bounds.left) / bounds.width * 2 - 1,
      1 - (clientY - bounds.top) / bounds.height * 2,
    ), this.camera)
    return this.raycaster.ray.intersectPlane(this.plane, new THREE.Vector3())
  }

  project(index) {
    const nail = this.nails[index]
    if (!nail) return null
    const point = new THREE.Vector3(nail.x, 0.35, nail.z).project(this.camera)
    return { x: (point.x + 1) * this.width / 2, y: (1 - point.y) * this.height / 2 }
  }

  showBoard(board) {
    const { nails, outline } = board
    if (this.outline !== outline) {
      this.outline = outline
      this.surface.geometry.dispose()
      this.surface.geometry = boardGeometry(outline)
      this.shadow.material.map?.dispose()
      this.shadow.material.map = contactShadow(outline)
      this.shadow.material.needsUpdate = true
      this.shadow.visible = true
    }
    if (this.nails !== nails) {
      this.nails = nails
      const matrix = new THREE.Matrix4()
      for (const [mesh, y] of this.nailMeshes) {
        mesh.count = nails.length
        nails.forEach(({ x, z }, index) => mesh.setMatrixAt(index, matrix.makeTranslation(x, y, z)))
        mesh.instanceMatrix.needsUpdate = true
        mesh.computeBoundingSphere()
      }
      for (const mesh of this.committed.children) mesh.geometry.dispose()
      this.committed.clear()
      this.chordCache = new WeakMap()
    }
    const existing = new Map(this.committed.children.map(mesh => [mesh.userData.piece, mesh]))
    const keep = new Set()
    this.chords = []
    const addPiece = (piece, geometry, material) => {
      const previous = existing.get(piece)
      if (previous) {
        keep.add(previous)
        return
      }
      const mesh = new THREE.Mesh(geometry(), material)
      mesh.castShadow = true
      mesh.receiveShadow = false
      mesh.userData.piece = piece
      this.committed.add(mesh)
      keep.add(mesh)
    }
    for (const strand of board.strands) {
      const material = this.threadMaterials[strand.color]
      const first = strand.wraps[0]
      const anchorAngle = first?.exitAngle ?? 0.73
      addPiece(`${strand.color}:${strand.anchor}:${strand.anchorLayer}:${anchorAngle}`, () => knotGeometry(nails[strand.anchor], strand.anchorLayer, anchorAngle - 0.74), material)
      let from = strand.anchor
      for (const wrap of strand.wraps) {
        let span = this.chordCache.get(wrap)
        if (!span) {
          const slack = Math.max(0, 0.055 - wrap.tension * 0.059)
          span = wrapChord(nails[from], nails[wrap.to], wrap, slack, this.chords)
          this.chordCache.set(wrap, span)
        }
        this.chords.push(span)
        addPiece(wrap, () => threadGeometry(wrapPoints(nails[from], nails[wrap.to], wrap, span)), material)
        from = wrap.to
      }
      const last = strand.wraps.at(-1)
      if (strand.tied && last) {
        addPiece(`tie:${strand.color}:${last.to}:${last.layer}`, () => knotGeometry(nails[last.to], last.layer, last.entryAngle + last.sweep - 0.96), material)
      }
    }
    for (const mesh of [...this.committed.children]) {
      if (keep.has(mesh)) continue
      mesh.geometry.dispose()
      mesh.removeFromParent()
    }
    this.draw()
  }

  showPull(strand, pull, status) {
    this.live.visible = Boolean(pull)
    this.guide.visible = Boolean(pull?.candidate)
    if (!pull) {
      this.draw()
      return
    }
    const nails = this.nails
    const from = nails[threadEnd(strand)]
    const slack = Math.max(0, 1 - pull.tension / 0.47)
    const candidate = pull.candidate
    let points
    if (!candidate?.route || candidate.engagement < 1) {
      const route = pull.free
      points = []
      const departureLift = route.fromArc ? 0.021 : 0
      arc(points, from, route.fromAngle ?? route.exitAngle, route.fromArc, route.fromY, departureLift)
      chord(points, describeChord(atAngle(from, route.exitAngle, WRAP_RADIUS), pull.hand, route.fromY + departureLift, POINTER_HEIGHT, slack, this.chords))
    }
    if (candidate?.route) {
      const { route, lead, engagement } = candidate
      const nail = nails[route.to]
      const wrapped = wrapPoints(from, nail, route, wrapChord(from, nail, route, slack, this.chords))
      const departureLift = lead.arc ? 0.021 : 0
      arc(wrapped, nail, route.entryAngle + route.sweep, lead.arc, route.toY, departureLift)
      chord(wrapped, describeChord(atAngle(nail, lead.exitAngle, WRAP_RADIUS), pull.hand, route.toY + departureLift, POINTER_HEIGHT, slack * 0.35))
      points = engagement === 1 ? wrapped : blendPaths(points, wrapped, engagement)
    }
    this.live.geometry.dispose()
    this.live.geometry = threadGeometry(points, THREAD_RADIUS * 1.05)
    this.liveMaterial.opacity = candidate?.route && !candidate.caught ? 0.83 : 1
    this.liveMaterial.color.copy(this.threadMaterials[strand.color].color)
    this.liveMaterial.emissive.set(status === 'Too tight' ? '#e66647' : palette[strand.color].color)
    this.liveMaterial.emissiveIntensity = status === 'Too tight' ? 0.22 : 0.075

    if (candidate) {
      const nail = nails[candidate.index]
      const angle = candidate.angle ?? 0
      const sweep = candidate.progress * TAU
      const ringStart = candidate.turn > 0 ? -angle : -angle - sweep
      this.guide.position.set(nail.x, POINTER_HEIGHT, nail.z)
      this.guideFill.geometry.dispose()
      this.guideFill.geometry = new THREE.RingGeometry(GUIDE_RADIUS - 0.02, GUIDE_RADIUS + 0.02, 48, 1, ringStart, Math.max(sweep, 0.001))
      this.guideFill.material.color.set(status === 'Too tight' ? '#ff9468' : candidate.caught ? '#ffce83' : '#fff3d9')
      this.guideStart.visible = candidate.startAngle !== null && !candidate.caught
      if (this.guideStart.visible) {
        this.guideStart.position.x = Math.cos(candidate.startAngle) * GUIDE_RADIUS
        this.guideStart.position.z = Math.sin(candidate.startAngle) * GUIDE_RADIUS
      }
    }
    this.draw()
  }

  draw() {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.renderer.render(this.scene, this.camera)
    })
  }
}

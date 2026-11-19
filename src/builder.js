import {
  addEdgeNails, drawnOutline, inOutline, EDGE_CLEARANCE, newBoard, placementError, presets, removeNail, threadedNails,
} from './board.js'
import { distance, nearestNail, palette } from './thread.js'

export const builderMarkup = `
  <dialog id="builder-dialog" aria-labelledby="builder-title">
    <div class="builder-head">
      <div><h2 id="builder-title">Build a board</h2><p id="builder-subtitle">Choose an outline and place your nails.</p></div>
      <button class="button icon-button builder-close" data-builder-close aria-label="Close board builder">×</button>
    </div>
    <div class="builder-body">
      <div class="builder-tools">
        <section id="builder-outlines">
          <h3>Board shape</h3>
          <div class="shape-grid" role="group" aria-label="Preset board shapes">
            ${presets.map(({ id, name }) => `<button class="shape-option" data-preset="${id}" aria-pressed="false"><canvas width="40" height="34" aria-hidden="true"></canvas><span>${name}</span></button>`).join('')}
          </div>
          <button class="button builder-tool" data-builder-tool="draw" aria-pressed="false">Draw outline</button>
        </section>
        <section>
          <h3>Nails</h3>
          <div class="nail-tools" role="group" aria-label="Nail tools">
            <button class="button builder-tool" data-builder-tool="place" aria-pressed="true">Place / move</button>
            <button class="button builder-tool" data-builder-tool="remove" aria-pressed="false">Remove</button>
          </div>
          <button id="builder-edge" class="button builder-tool">Add edge nails</button>
        </section>
      </div>
      <div class="builder-preview">
        <div class="builder-mat"><canvas id="builder-canvas" tabindex="0" aria-label="Board outline and nail placement" aria-describedby="builder-canvas-help"></canvas></div>
        <span id="builder-canvas-help" class="sr-only">Use the arrow keys to position the nail cursor, Enter to place a nail, and Delete to remove a nail. Draw a freehand outline with your mouse or touch.</span>
        <p id="builder-hint" role="status"></p>
      </div>
    </div>
    <div class="builder-footer">
      <button id="builder-undo" class="button builder-tool">Undo edit</button>
      <span id="builder-count"></span>
      <button class="button builder-cancel" data-builder-close>Cancel</button>
      <button id="builder-save" class="button tie-button">Start winding</button>
    </div>
  </dialog>
`

const PREVIEW_SIZE = 9.5
const SELECT_RADIUS = 0.24
const toolHints = {
  draw: 'Drag to draw one outline. Release to close the shape.',
  place: 'Click the wood to place a nail. Drag a nail to move it.',
  remove: 'Click a nail to remove it.',
}

function trace(context, outline, close = true) {
  context.beginPath()
  outline.forEach(({ x, z }, i) => {
    if (i === 0) context.moveTo(x, z)
    else context.lineTo(x, z)
  })
  if (close) context.closePath()
}

function paintNail(context, point, fill, outlined = false) {
  context.beginPath()
  context.arc(point.x, point.z, outlined ? 0.135 : 0.103, 0, 2 * Math.PI)
  context.fillStyle = fill
  context.fill()
  context.lineWidth = 0.028
  context.strokeStyle = outlined ? '#9b422e' : '#55483b'
  context.stroke()
}

export class BoardBuilder {
  constructor(dialog, onCommit) {
    this.dialog = dialog
    this.onCommit = onCommit
    this.get = id => dialog.querySelector(`#${id}`)
    this.canvas = this.get('builder-canvas')
    this.context = this.canvas.getContext('2d')
    this.shapeButtons = [...dialog.querySelectorAll('[data-preset]')]
    this.toolButtons = [...dialog.querySelectorAll('[data-builder-tool]')]
    this.shapeButtons.forEach((button, index) => {
      const { outline, id } = presets[index]
      const icon = button.querySelector('canvas').getContext('2d')
      icon.setTransform(3.4, 0, 0, 3.4, 20, 17)
      trace(icon, outline)
      icon.fillStyle = '#dbac7a'
      icon.strokeStyle = '#9c623d'
      icon.lineWidth = 0.19
      icon.fill()
      icon.stroke()
      button.addEventListener('click', () => this.setShape(id, outline))
    })
    this.toolButtons.forEach(button => button.addEventListener('click', () => {
      this.tool = button.dataset.builderTool
      this.cursor = null
      this.update()
    }))
    for (const button of dialog.querySelectorAll('[data-builder-close]')) button.addEventListener('click', () => dialog.close())
    dialog.addEventListener('close', () => { this.gesture = null; this.cursor = null })
    this.get('builder-undo').addEventListener('click', () => {
      if (!this.history.length) return
      this.draft = this.history.pop()
      this.update()
    })
    this.get('builder-edge').addEventListener('click', () => {
      const nails = addEdgeNails(this.draft.outline, this.draft.nails)
      const added = nails.length - this.draft.nails.length
      if (added) this.change({ ...this.draft, nails }, `Added ${added} edge nails.`)
      else this.update('The edge already has nails in the available spots.')
    })
    this.get('builder-save').addEventListener('click', () => {
      if (this.draft.nails.length < 2) return
      dialog.close()
      this.onCommit(this.draft, this.editing)
    })
    this.canvas.addEventListener('pointerdown', event => this.begin(event))
    this.canvas.addEventListener('pointermove', event => this.move(event))
    this.canvas.addEventListener('pointerup', event => this.finish(event))
    for (const type of ['pointercancel', 'lostpointercapture']) this.canvas.addEventListener(type, event => {
      if (this.gesture?.id !== event.pointerId) return
      this.gesture = null
      this.cursor = null
      this.update()
    })
    this.canvas.addEventListener('pointerleave', () => {
      if (this.gesture) return
      this.cursor = null
      this.draw()
    })
    this.canvas.addEventListener('keydown', event => this.key(event))
    new ResizeObserver(() => this.draw()).observe(this.canvas)
  }

  open(board) {
    this.editing = Boolean(board)
    this.draft = board ?? newBoard()
    this.lockedOutline = Boolean(board?.strands.length)
    this.tool = 'place'
    this.gesture = null
    this.cursor = null
    this.history = []
    this.get('builder-title').textContent = this.editing ? 'Edit board layout' : 'Build a board'
    this.get('builder-subtitle').textContent = this.lockedOutline
      ? 'Add nails or reposition unused ones. Threaded nails stay in place.'
      : 'Choose a shape or draw your own, then place your nails.'
    this.get('builder-outlines').hidden = this.lockedOutline
    this.get('builder-save').textContent = this.editing ? 'Save layout' : 'Start winding'
    this.dialog.showModal()
    this.update()
  }

  change(next, message) {
    this.history.push(this.draft)
    if (this.history.length > 80) this.history.shift()
    this.draft = next
    this.update(message)
  }

  setShape(preset, outline) {
    if (this.lockedOutline) return
    this.tool = 'place'
    if (this.draft.outline === outline) {
      this.update()
      return
    }
    const nails = this.draft.nails.filter(nail => inOutline(nail, outline, EDGE_CLEARANCE))
    const removed = this.draft.nails.length - nails.length
    this.change({ ...this.draft, preset, outline, nails }, removed ? `Removed ${removed} nails outside the new outline.` : undefined)
  }

  update(message = toolHints[this.tool]) {
    this.shapeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.preset === this.draft.preset)))
    this.toolButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.builderTool === this.tool)))
    const count = this.draft.nails.length
    this.canvas.dataset.tool = this.tool
    this.get('builder-count').textContent = `${count} ${count === 1 ? 'nail' : 'nails'}${count < 2 ? ' · 2 to begin' : ''}`
    this.get('builder-hint').textContent = message
    this.get('builder-save').disabled = count < 2
    this.get('builder-undo').disabled = this.history.length === 0
    this.draw()
  }

  point(event) {
    const bounds = this.canvas.getBoundingClientRect()
    const units = Math.min(bounds.width, bounds.height) / PREVIEW_SIZE
    return {
      x: (event.clientX - bounds.left - bounds.width / 2) / units,
      z: (event.clientY - bounds.top - bounds.height / 2) / units,
    }
  }

  begin(event) {
    if (event.button !== 0 || this.gesture) return
    const point = this.point(event)
    const index = nearestNail(point, this.draft.nails, SELECT_RADIUS)
    if (this.tool !== 'draw' && threadedNails(this.draft).has(index)) {
      this.update('This nail is holding thread.')
      return
    }
    this.cursor = point
    this.gesture = { id: event.pointerId, index, start: point, stroke: [point], length: 0, closed: false }
    this.canvas.focus({ preventScroll: true })
    this.canvas.setPointerCapture(event.pointerId)
    this.draw()
  }

  sample(point) {
    const drawing = this.gesture
    if (drawing.closed || drawing.stroke.length >= 1600) return
    const step = distance(drawing.stroke.at(-1), point)
    if (step < 0.036) return
    if (drawing.length > 1.8 && distance(drawing.start, point) < 0.13) {
      drawing.closed = true
      return
    }
    drawing.length += step
    drawing.stroke.push(point)
  }

  move(event) {
    if (this.gesture && this.gesture.id !== event.pointerId) return
    this.cursor = this.point(event)
    if (this.tool === 'draw' && this.gesture) {
      const coalesced = event.getCoalescedEvents?.() ?? []
      for (const sample of coalesced) this.sample(this.point(sample))
      this.sample(this.cursor)
    }
    this.draw()
  }

  finish(event) {
    const drawing = this.gesture
    if (drawing?.id !== event.pointerId) return
    const point = this.point(event)
    if (this.tool === 'draw') this.sample(point)
    this.gesture = null
    this.cursor = null
    if (this.tool === 'draw') {
      const outline = drawnOutline(drawing.stroke)
      if (outline) this.setShape('custom', outline)
      else this.update('Draw a larger single outline with edges that do not cross.')
    } else if (this.tool === 'remove') {
      this.remove(drawing.index)
    } else if (drawing.index < 0 || distance(drawing.start, point) > 0.035) {
      this.place(point, drawing.index)
    } else {
      this.update()
    }
  }

  place(point, index = -1) {
    const issue = placementError(point, this.draft.outline, this.draft.nails, index)
    if (issue) {
      this.update(issue)
      return
    }
    const nails = index < 0 ? [...this.draft.nails, point] : this.draft.nails.map((nail, i) => i === index ? point : nail)
    this.change({ ...this.draft, nails })
  }

  remove(index) {
    const next = removeNail(this.draft, index)
    if (next !== this.draft) this.change(next)
    else this.update(index < 0 ? 'Click directly on a nail to remove it.' : 'This nail is holding thread.')
  }

  key(event) {
    if (this.tool === 'draw') return
    const movement = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
    if (movement) {
      event.preventDefault()
      const { x, z } = this.cursor ?? { x: 0, z: 0 }
      const clamp = number => Math.max(-4.5, Math.min(4.5, number))
      this.cursor = { x: clamp(x + movement[0] * 0.2), z: clamp(z + movement[1] * 0.2) }
      this.draw()
    } else if (['Enter', ' ', 'Delete'].includes(event.key)) {
      event.preventDefault()
      this.cursor ??= { x: 0, z: 0 }
      if (event.key === 'Delete' || this.tool === 'remove') this.remove(nearestNail(this.cursor, this.draft.nails, SELECT_RADIUS))
      else this.place(this.cursor)
    }
  }

  draw() {
    if (!this.dialog.open || !this.context || !this.draft) return
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (!width || !height) return
    const pixelRatio = Math.min(devicePixelRatio, 2)
    const pxWidth = Math.round(width * pixelRatio)
    const pxHeight = Math.round(height * pixelRatio)
    if (this.canvas.width !== pxWidth || this.canvas.height !== pxHeight) {
      this.canvas.width = pxWidth
      this.canvas.height = pxHeight
    }
    const context = this.context
    context.resetTransform()
    context.clearRect(0, 0, pxWidth, pxHeight)
    const unit = Math.min(pxWidth, pxHeight) / PREVIEW_SIZE
    context.setTransform(unit, 0, 0, unit, pxWidth / 2, pxHeight / 2)
    const { outline, nails, strands } = this.draft
    const drawing = this.tool === 'draw' ? this.gesture : null
    trace(context, outline)
    const wood = context.createLinearGradient(-4, -4, 4, 4)
    wood.addColorStop(0, '#e7ba88')
    wood.addColorStop(1, '#c78c5e')
    context.globalAlpha = drawing ? 0.34 : 1
    context.fillStyle = wood
    context.fill()
    context.strokeStyle = '#aa6c45'
    context.lineWidth = 0.044
    context.stroke()
    context.save()
    context.clip()
    context.strokeStyle = '#a06a44'
    context.globalAlpha *= 0.13
    context.lineWidth = 0.012
    for (let i = 0; i < 104; i++) {
      const z = i * 0.085 - 4.4
      context.beginPath()
      context.moveTo(-4.4, z)
      context.bezierCurveTo(-1, z + Math.sin(i * 0.14) * 0.16, 1, z + Math.cos(i * 0.11) * 0.20, 4.4, z + 0.07)
      context.stroke()
    }
    context.restore()
    context.globalAlpha = 1

    for (const strand of strands) {
      trace(context, [nails[strand.anchor], ...strand.wraps.map(wrap => nails[wrap.to])], false)
      context.strokeStyle = palette[strand.color].color
      context.lineWidth = 0.026
      context.stroke()
    }
    const used = threadedNails(this.draft)
    const moving = this.tool === 'place' ? this.gesture?.index : -1
    if (!drawing) nails.forEach((point, i) => {
      context.globalAlpha = moving === i ? 0.33 : 1
      paintNail(context, point, '#d8d7d0', used.has(i))
    })
    context.globalAlpha = 1

    if (drawing) {
      trace(context, drawing.stroke, drawing.closed)
      context.strokeStyle = '#9b422e'
      context.lineWidth = 0.045
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.stroke()
      paintNail(context, drawing.start, '#fff9e9')
    } else if (this.cursor && this.tool === 'place') {
      const nail = nearestNail(this.cursor, nails, SELECT_RADIUS)
      if (nail < 0 || moving >= 0 || this.canvas.matches(':focus-visible')) {
        const valid = !placementError(this.cursor, outline, nails, moving ?? -1)
        paintNail(context, this.cursor, valid ? '#f6edd4c8' : '#c45c4ab0')
      }
    } else if (this.cursor && this.tool === 'remove') {
      const nail = nearestNail(this.cursor, nails, SELECT_RADIUS)
      if (nail >= 0 && !used.has(nail)) paintNail(context, nails[nail], '#e8977b', true)
    }
  }
}

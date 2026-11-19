import './style.css'
import { boardName, MAX_NAILS, newBoard, placementError, roundNails, validOutline } from './board.js'
import { BoardBuilder, builderMarkup } from './builder.js'
import { Workbench } from './workbench.js'
import {
  atAngle, commitWrap, continuePull, countContacts, direction, distance, GUIDE_RADIUS, makeStrand,
  movePull, nearestNail, palette, RELEASE_RADIUS,
  starterBoard, startPull, tensionState, threadEnd,
} from './thread.js'

const icons = {
  logo: '<circle cx="12" cy="12" r="8.8"/><path d="M6 6.1 15.5 4M3.6 10.2l15-3.3M3.6 14.4l16.8-3.7M6 18l14-3.1m-10 6 7.5-1.7"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9.1a3 3 0 0 1 5.8.9c0 1.9-2.9 2.3-2.9 4m0 3h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  undo: '<path d="m9 6-5 5 5 5m-5-5h10a5 5 0 0 1 5 5v2"/>',
  redo: '<path d="m15 6 5 5-5 5m5-5H10a5 5 0 0 0-5 5v2"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8.2 8.2 11.3 11.3M14 10l5.5-5.5M8.2 15.8 10 14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  mouse: '<rect x="6.5" y="3" width="11" height="18" rx="5.5"/><path d="M12 7v3"/>',
  hand: '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1a6 6 0 0 1-4.7-2.3l-3.8-4.9a1.5 1.5 0 0 1 2.3-1.9L8 14"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9H4Zm12 0a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10"/>',
  muted: '<path d="M4 9v6h4l5 4V5L8 9H4Zm12 1 4 4m0-4-4 4"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  edit: '<path d="m4 16-1 5 5-1L20 8l-4-4L4 16Zm10-10 4 4"/>',
}

function icon(name, className = '') {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`
}

const app = document.querySelector('#app')
app.innerHTML = `
  <header class="topbar">
    <div class="topbar-inner">
      <div class="brand"><span class="brand-mark">${icon('logo')}</span><span>Stringwork<span class="brand-period">.</span></span></div>
      <nav class="top-actions" aria-label="Workbench tools">
        <button id="sound" class="button icon-button sound" aria-label="Mute wrap sounds" title="Mute wrap sounds">${icon('volume')}</button>
        <button id="help" class="button text-button" aria-label="How to play">${icon('help')}<span>How to play</span></button>
        <button id="clear" class="button new-button">${icon('plus')}<span>New board</span></button>
      </nav>
    </div>
  </header>

  <main class="workspace">
    <div class="intro">
      <h1>The workbench</h1>
      <p>Make one full circle around a nail. The wrap holds when the thread is taut.</p>
    </div>
    <div class="layout">
      <section class="stage" id="stage" aria-label="String art board">
        <canvas id="board" tabindex="0" aria-label="Interactive 32-nail string art board" aria-describedby="keyboard-guide"></canvas>
        <span id="keyboard-guide" class="sr-only">Use Enter to grip the thread, the arrow keys to select a nail, Q or E to wind, Space to adjust tension, and Escape to park the thread.</span>
        <div class="board-label">
          <span id="piece-name">Rosette study</span>
          <span class="board-spec" id="board-spec">32 nails · Round board</span>
        </div>
        <div id="end-mark" class="end-mark" aria-hidden="true"></div>
        <div id="key-mark" class="key-mark" aria-hidden="true" hidden></div>
        <div id="wrap-flash" class="wrap-flash" aria-hidden="true" hidden>${icon('check')}</div>
        <div id="board-error" class="board-error" hidden>WebGL is unavailable in this browser. Open the workbench in a browser with hardware acceleration enabled.</div>
        <div id="live-tension" class="live-tension pill" aria-hidden="true" hidden></div>
        <div class="stage-toolbar">
          <div class="grip-hint">${icon('mouse')}<span id="grip-hint">Click the marked nail</span></div>
          <button id="reel" class="reel-button" title="Reset spool tension (Space)" hidden>${icon('hand')}<span>Take up slack</span><kbd>Space</kbd></button>
          <div class="zoom" id="zoom-controls" aria-label="Board zoom">
            <button id="zoom-out" class="icon-button" aria-label="Zoom out" title="Zoom out">${icon('minus')}</button>
            <button id="fit" aria-label="Reset board zoom" title="Reset board zoom">100%</button>
            <button id="zoom-in" class="icon-button" aria-label="Zoom in" title="Zoom in">${icon('plus')}</button>
          </div>
        </div>
      </section>

      <aside class="controls" aria-label="String tools">
        <section class="panel tension-panel" aria-labelledby="tension-heading">
          <div class="panel-heading">
            <h2 id="tension-heading">Thread tension</h2>
            <span id="tension-state" class="pill" data-state="parked">Parked</span>
          </div>
          <div class="reading"><span id="reading">63</span><span class="reading-scale">/ 100</span></div>
          <div class="meter" id="meter" role="meter" aria-label="Thread tension" aria-valuemin="0" aria-valuemax="100" aria-valuenow="63">
            <div class="meter-track"><span></span><span></span><span></span></div>
            <div id="needle" class="needle"></div>
          </div>
          <div class="meter-labels"><span>Slack</span><span>Taut</span><span>Too tight</span></div>
          <p id="tension-tip" class="tension-tip" aria-live="polite">Pick up the marked end to measure your next wrap.</p>
          <label class="mouse-grip"><span>Hold mouse to drag</span><input id="hold-mouse" type="checkbox" role="switch"></label>
        </section>

        <section class="panel thread-panel" aria-labelledby="color-heading">
          <div class="panel-heading"><h2 id="color-heading">Thread color</h2><span class="color-name" id="color-name">Persimmon</span></div>
          <div class="swatches" role="group" aria-label="Choose a thread color">
            ${palette.map(({ name, color }, index) => `<button class="swatch" data-color="${index}" type="button" style="--thread:${color}" aria-label="${name}" title="${name}" aria-pressed="${index === 0}"><span>${icon('check')}</span></button>`).join('')}
          </div>
        </section>

        <section class="panel piece-panel" aria-labelledby="piece-heading">
          <div class="panel-heading"><h2 id="piece-heading">Your piece</h2><button id="edit-layout" class="button layout-button">${icon('edit')}<span>Edit layout</span></button></div>
          <dl class="stats">
            <div><dt>Wraps</dt><dd id="wraps">64</dd></div>
            <div><dt>Thread used</dt><dd id="thread-used">0 m</dd></div>
          </dl>
          <div class="edit-actions">
            <button id="undo" class="button undo-button" title="Undo (Ctrl+Z)">${icon('undo')}<span>Undo</span></button>
            <button id="redo" class="button icon-button redo-button" aria-label="Redo" title="Redo (Ctrl+Shift+Z)">${icon('redo')}</button>
            <button id="tie" class="button tie-button">${icon('scissors')}<span>Tie off</span></button>
          </div>
        </section>
      </aside>
    </div>
    <div class="workspace-footer">
      <span><span class="saved-dot"></span><span id="save-state">Saved on this device</span></span>
    </div>
  </main>

  <dialog id="help-dialog">
    <div class="dialog-head">
      <div><h2>How to play</h2><p>Start with the rosette or build a board and place your nails.</p></div>
      <button class="button icon-button" id="close-help" aria-label="Close instructions">${icon('close')}</button>
    </div>
    <ol class="steps">
      <li><strong>Grip the thread.</strong> Click the marked nail to pick up the thread, or click any nail to start a strand. Move the mouse to wind. Enable <em>Hold mouse to drag</em> for press-and-hold controls. On touch, press and hold the nail.</li>
      <li><strong>Wind around a nail.</strong> Drag to another nail and make a full circle back to the dot in either direction. The wrap sets at 360° when the meter is green. Keep dragging to wind another nail.</li>
      <li><strong>Adjust tension.</strong> After a full circle, the thread stays around the nail while you hold it. Pull if it’s slack or ease inward if it’s too tight. Press <kbd>Space</kbd> or tap <em>Take up slack</em> with a second finger to adjust the spool.</li>
      <li><strong>Park or tie off.</strong> Click again or press <kbd>Esc</kbd> to park in click mode. With press-and-hold controls, release your grip to park. Tie off when you’re done with a strand. Choosing a different color also ties off the current strand.</li>
    </ol>
    <p class="keyboard-help"><strong>Keyboard</strong> Grip with <kbd>Enter</kbd>, select the next nail with the arrow keys, and wind a full turn with <kbd>Q</kbd> or <kbd>E</kbd>. Press <kbd>Esc</kbd> to park.</p>
    <button id="done-help" class="button tie-button">Back to the board</button>
  </dialog>
  ${builderMarkup}
`

const get = id => document.getElementById(id)
const storageKey = 'stringwork-board-v1'
const mouseGripKey = 'stringwork-hold-mouse'
const canvas = get('board')
const stage = get('stage')
const dialog = get('help-dialog')
const builderDialog = get('builder-dialog')
const swatches = [...document.querySelectorAll('.swatch')]
const undoStack = []
const redoStack = []

function loadBoard() {
  try {
    let saved = JSON.parse(localStorage.getItem(storageKey))
    if (saved && saved.outline === undefined && saved.nails === undefined) {
      saved = { ...newBoard(), ...saved, nails: roundNails }
    }
    const validNail = index => Number.isInteger(index) && index >= 0 && index < saved.nails.length
    if (saved && typeof saved.name === 'string' && palette[saved.color] && typeof saved.preset === 'string'
      && validOutline(saved.outline) && Array.isArray(saved.nails) && saved.nails.length >= 2 && saved.nails.length <= MAX_NAILS
      && saved.nails.every((nail, i) => nail && Number.isFinite(nail.x) && Number.isFinite(nail.z)
        && !placementError(nail, saved.outline, saved.nails, i))
      && Array.isArray(saved.strands)
      && saved.strands.every(strand => palette[strand.color] && validNail(strand.anchor)
        && Number.isInteger(strand.anchorLayer) && Array.isArray(strand.wraps)
        && strand.wraps.every(wrap => validNail(wrap.to) && ['length', 'restLength', 'tension', 'layer', 'sweep',
          'exitAngle', 'entryAngle', 'fromArc', 'fromY', 'toY'].every(key => Number.isFinite(wrap[key]))
          && (wrap.fromAngle === null || Number.isFinite(wrap.fromAngle))))) return saved
  } catch {
    // A blocked or unreadable save should still allow a fresh workbench.
  }
  return starterBoard()
}

let board = loadBoard()
let contacts = countContacts(board)
let bench
let pull = null
let pointer = null
let pointerType = matchMedia('(any-pointer: fine)').matches ? 'mouse' : 'touch'
let holdMouse = false
let keyboard = false
let selectedNail = 0
let keyboardAngle = 0
let zoom = 1
let sound = true
let audio
let flashTimer
let restingTip = ''

try {
  holdMouse = localStorage.getItem(mouseGripKey) === 'true'
} catch {
  // The preference still works for the current session.
}

try {
  bench = new Workbench(canvas)
} catch (error) {
  get('board-error').hidden = false
  console.error('Could not initialize the workbench', error)
}

function currentStrand() {
  const last = board.strands.at(-1)
  return last && !last.tied ? last : null
}

function replaceStrand(strand) {
  return { ...board, strands: [...board.strands.slice(0, -1), strand] }
}

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(board))
    get('save-state').textContent = 'Saved on this device'
  } catch {
    get('save-state').textContent = 'Changes kept for this session'
  }
}

function renderBoard() {
  contacts = countContacts(board)
  bench?.showBoard(board)
  get('piece-name').textContent = board.name
  const description = `${board.nails.length} nails · ${boardName(board.preset)} board`
  get('board-spec').textContent = description
  canvas.setAttribute('aria-label', `Interactive string art board, ${description}`)
  selectedNail = Math.min(selectedNail, board.nails.length - 1)
  get('color-name').textContent = palette[board.color].name
  swatches.forEach(swatch => swatch.setAttribute('aria-pressed', String(Number(swatch.dataset.color) === board.color)))
  get('undo').disabled = undoStack.length === 0
  get('redo').disabled = redoStack.length === 0
  get('tie').disabled = !currentStrand()
  let wraps = 0
  let length = 0
  for (const strand of board.strands) {
    wraps += strand.wraps.length
    for (const wrap of strand.wraps) length += wrap.restLength
  }
  get('wraps').textContent = wraps.toLocaleString()
  const centimeters = length * 3
  get('thread-used').textContent = centimeters >= 100 ? `${(centimeters / 100).toFixed(1)} m` : `${Math.round(centimeters)} cm`
  updateHUD()
}

function applyBoard(next) {
  undoStack.push(board)
  if (undoStack.length > 100) undoStack.shift()
  redoStack.length = 0
  board = next
  renderBoard()
  persist()
}

function history(from, to) {
  if (from.length === 0) return
  park()
  restingTip = ''
  to.push(board)
  board = from.pop()
  renderBoard()
  persist()
}

function mark(element, index) {
  if (!bench || !bench.width) return
  const point = bench.project(index)
  if (!point) return
  element.style.left = `${point.x}px`
  element.style.top = `${point.y}px`
}

function updateMarkers() {
  const strand = currentStrand()
  get('end-mark').hidden = !strand || Boolean(pull)
  if (strand && !pull) mark(get('end-mark'), threadEnd(strand))
  get('key-mark').hidden = !keyboard
  if (keyboard) mark(get('key-mark'), selectedNail)
}

function updateHUD() {
  const strand = currentStrand()
  const lastWrap = board.strands.at(-1)?.wraps.at(-1)
  const tension = pull?.tension ?? lastWrap?.tension
  const reading = tension === undefined ? null : Math.round(Math.min(1, tension) * 100)
  const status = pull ? tensionState(tension) : strand ? 'Parked' : 'Ready'
  const target = pull?.candidate
  const caught = target?.caught
  const turn = target ? Math.min(359, Math.floor(target.progress * 360)) : 0

  get('tension-state').textContent = status
  get('tension-state').dataset.state = status.toLowerCase().replace(' ', '-')
  get('reading').textContent = reading ?? '—'
  get('needle').hidden = reading === null
  get('needle').style.left = `${Math.max(1, Math.min(99, reading ?? 0))}%`
  get('meter').setAttribute('aria-valuenow', reading ?? 0)
  get('meter').setAttribute('aria-valuetext', reading === null ? 'No tension reading' : `${reading} out of 100, ${pull ? status : 'last wrap'}`)
  stage.dataset.gripping = String(Boolean(pull))
  get('reel').hidden = !pull
  get('zoom-controls').hidden = Boolean(pull)
  const live = get('live-tension')
  live.hidden = !pull
  if (pull) {
    live.dataset.state = get('tension-state').dataset.state
    live.textContent = `${status} · ${reading}`
  }

  let tip = restingTip || (strand ? 'Pick up the marked end to measure your next wrap.' : 'Pick any nail to anchor a new strand.')
  const clickMode = pointerType === 'mouse' && !holdMouse
  const gripAction = clickMode ? 'Click' : 'Drag from'
  let hint = strand ? `${gripAction} the marked nail` : `${gripAction} any nail to start`
  if (pull) {
    hint = caught ? (status === 'Too tight' ? 'Full turn · ease inward' : 'Full turn · take up slack')
      : target ? `Winding · ${turn}° / 360°`
        : pointer?.latched ? 'Move to wind · click to park' : 'Drag to another nail and circle it'
    tip = target && !caught ? (keyboard ? 'Keep winding for a full turn.' : 'Follow the guide all the way back to the dot.')
      : status === 'Slack' ? 'Pull outward or take up slack to tighten the thread.'
        : status === 'Too tight' ? 'Ease toward the nail or take up slack to reset the spool.'
          : 'Tension is in range. Guide the thread around a nail.'
  }
  if (get('tension-tip').textContent !== tip) get('tension-tip').textContent = tip
  if (get('grip-hint').textContent !== hint) get('grip-hint').textContent = hint
  updateMarkers()
}

function resize() {
  if (!bench) return
  bench.resize(stage.clientWidth, stage.clientHeight, zoom)
  get('fit').textContent = `${Math.round(zoom * 100)}%`
  get('zoom-out').disabled = zoom <= 0.8
  get('zoom-in').disabled = zoom >= 1.2
  updateMarkers()
}

function playWrap() {
  if (!sound || !window.AudioContext) return
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume().catch(() => {})
    const now = audio.currentTime
    const pluck = audio.createOscillator()
    const envelope = audio.createGain()
    pluck.type = 'triangle'
    pluck.frequency.setValueAtTime(495, now)
    pluck.frequency.exponentialRampToValueAtTime(310, now + 0.067)
    envelope.gain.setValueAtTime(0.0001, now)
    envelope.gain.exponentialRampToValueAtTime(0.036, now + 0.006)
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
    pluck.connect(envelope).connect(audio.destination)
    pluck.start(now)
    pluck.stop(now + 0.125)
  } catch {
    // The geometric and meter feedback do not depend on audio.
  }
}

function flash(nail) {
  const marker = get('wrap-flash')
  clearTimeout(flashTimer)
  mark(marker, nail)
  marker.hidden = false
  marker.animate?.([{ opacity: 0, scale: 0.68 }, { opacity: 1, scale: 1 }, { opacity: 0, scale: 1.15 }], {
    duration: 530, easing: 'ease-out',
  })
  flashTimer = setTimeout(() => { marker.hidden = true }, 530)
}

function activePull(point, reel = false, draw = true) {
  if (!pull || !point) return
  const strand = currentStrand()
  const wraps = movePull(pull, strand, point, contacts, reel)
  if (wraps) {
    const wrap = commitWrap(pull)
    const next = { ...strand, wraps: [...strand.wraps, wrap] }
    pull = continuePull(next, point, wrap.tension, board.nails)
    applyBoard(replaceStrand(next))
    flash(wrap.to)
    playWrap()
    if (pointer?.type === 'touch') navigator.vibrate?.(12)
  }
  if (draw) {
    bench.showPull(currentStrand(), pull, tensionState(pull.tension))
    updateHUD()
  }
}

function grip(index, point) {
  let strand = currentStrand()
  if (!strand) {
    strand = { ...makeStrand(board), anchor: index, anchorLayer: contacts[index] }
    applyBoard({ ...board, strands: [...board.strands, strand] })
  }
  restingTip = ''
  pull = startPull(strand, point, board.nails)
  activePull(point)
}

function park() {
  const target = pull?.candidate
  if (target?.caught) {
    const status = tensionState(pull.tension)
    if (status === 'Slack') restingTip = 'That wrap was slack. Pull outward or take up slack before releasing.'
    if (status === 'Too tight') restingTip = 'That wrap was too tight. Ease the thread before releasing.'
  } else if (target?.progress > 0.12) {
    restingTip = 'Complete a full circle back to the dot before releasing.'
  }
  pull = null
  const previous = pointer
  pointer = null
  if (previous && canvas.hasPointerCapture(previous.id)) canvas.releasePointerCapture(previous.id)
  bench?.showPull(null, null)
  updateHUD()
}

function tieOff() {
  park()
  const strand = currentStrand()
  if (!strand) return
  restingTip = 'Strand tied off. Pick any nail to start another.'
  applyBoard(replaceStrand({ ...strand, tied: true }))
}

function setColor(color) {
  if (color === board.color) return
  park()
  const strand = currentStrand()
  const next = strand ? replaceStrand({ ...strand, tied: true }) : board
  restingTip = strand ? `Strand tied off. Pick a nail for ${palette[color].name}.` : ''
  applyBoard({ ...next, color })
}

function gripNail(point) {
  const nearest = nearestNail(point, board.nails)
  const strand = currentStrand()
  if (!strand) return nearest
  const end = threadEnd(strand)
  return nearest === end || (nearest === -1 && distance(point, board.nails[end]) <= RELEASE_RADIUS) ? end : -1
}

canvas.addEventListener('pointerdown', event => {
  if (!bench || event.button !== 0) return
  if (pointer) {
    if (pointer.latched && pointer.id === event.pointerId) park()
    return
  }
  pointerType = event.pointerType
  keyboard = false
  if (pull) park()
  const point = bench.point(event.clientX, event.clientY)
  if (!point) return
  const index = gripNail(point)
  if (index === -1) {
    restingTip = currentStrand() ? 'Start from the marked nail to pick up the strand.' : 'Start by pressing directly on a nail.'
    updateHUD()
    return
  }
  event.preventDefault()
  canvas.focus({ preventScroll: true })
  const latched = event.pointerType === 'mouse' && !holdMouse
  pointer = { id: event.pointerId, type: event.pointerType, latched }
  if (!latched) canvas.setPointerCapture(event.pointerId)
  grip(index, point)
})

canvas.addEventListener('pointermove', event => {
  if (!bench || pull || event.pointerType !== 'mouse') return
  if (pointerType !== 'mouse') {
    pointerType = 'mouse'
    updateHUD()
  }
  const point = bench.point(event.clientX, event.clientY)
  const hit = point && gripNail(point) >= 0
  canvas.style.cursor = hit ? 'grab' : ''
})

document.addEventListener('pointermove', event => {
  if (pointer?.id !== event.pointerId) return
  if (pointer.latched && event.target.closest?.('button, input, label')) return
  const coalesced = event.getCoalescedEvents?.() ?? []
  const samples = coalesced.length ? coalesced : [event]
  samples.forEach((sample, index) => {
    activePull(bench.point(sample.clientX, sample.clientY), false, index === samples.length - 1)
  })
})

document.addEventListener('pointerdown', event => {
  if (pointer?.latched && pointer.id === event.pointerId && event.button === 0
    && event.target !== canvas && !get('reel').contains(event.target)) park()
})

canvas.addEventListener('pointerup', event => {
  if (pointer?.id !== event.pointerId || pointer.latched) return
  activePull(bench.point(event.clientX, event.clientY))
  park()
})
document.addEventListener('pointercancel', event => { if (pointer?.id === event.pointerId) park() })
canvas.addEventListener('lostpointercapture', event => {
  if (pointer?.id === event.pointerId && !pointer.latched && !canvas.hasPointerCapture(event.pointerId)) park()
})
window.addEventListener('blur', () => { if (pointer) park() })

const keySteps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }

function keyboardTarget(index) {
  if (pull?.candidate?.caught) return
  selectedNail = index
  if (pull && pull.start !== index) {
    const target = board.nails[index]
    keyboardAngle = direction(target, board.nails[pull.start])
    pull.candidate = null
    pull.traces.clear()
    activePull(atAngle(target, keyboardAngle, GUIDE_RADIUS))
  }
  updateMarkers()
}

canvas.addEventListener('keydown', event => {
  if (!bench || pointer) return
  const key = event.key.toLowerCase()
  if (!(event.key in keySteps) && !['enter', 'q', 'e', 'escape'].includes(key)) return
  event.preventDefault()
  if (!keyboard) {
    keyboard = true
    selectedNail = currentStrand() ? threadEnd(currentStrand()) : 0
  }
  if (event.key in keySteps) {
    const count = board.nails.length
    const step = keySteps[event.key]
    const advance = Math.sign(step) * Math.min(Math.abs(step), count - 1)
    keyboardTarget((selectedNail + advance + count) % count)
  } else if (key === 'enter' && !pull) {
    const strand = currentStrand()
    selectedNail = strand ? threadEnd(strand) : selectedNail
    grip(selectedNail, board.nails[selectedNail])
  } else if ((key === 'q' || key === 'e') && pull?.candidate && !pull.candidate.caught) {
    keyboardAngle += (key === 'q' ? -1 : 1) * Math.PI / 10
    activePull(atAngle(board.nails[selectedNail], keyboardAngle, GUIDE_RADIUS))
  } else if (key === 'escape') {
    keyboard = false
    park()
  }
  updateMarkers()
})

canvas.addEventListener('blur', () => {
  if (pull && (keyboard || pointer?.latched)) park()
  keyboard = false
  updateMarkers()
})

document.addEventListener('keydown', event => {
  if (dialog.open || builderDialog.open) return
  const key = event.key.toLowerCase()
  if (pull && (event.code === 'Space' || key === 'escape')) {
    event.preventDefault()
    if (key === 'escape') park()
    else activePull(pull.hand, true)
  }
  if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) {
    event.preventDefault()
    if (event.shiftKey || key === 'y') history(redoStack, undoStack)
    else history(undoStack, redoStack)
  }
})

get('help').addEventListener('click', () => { park(); dialog.showModal() })
get('close-help').addEventListener('click', () => dialog.close())
get('done-help').addEventListener('click', () => dialog.close())
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return
  const { left, right, top, bottom } = dialog.getBoundingClientRect()
  if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) dialog.close()
})
get('undo').addEventListener('click', () => history(undoStack, redoStack))
get('redo').addEventListener('click', () => history(redoStack, undoStack))
get('tie').addEventListener('click', tieOff)
get('hold-mouse').checked = holdMouse
get('hold-mouse').addEventListener('change', event => {
  holdMouse = event.currentTarget.checked
  if (pointer?.type === 'mouse') park()
  try {
    localStorage.setItem(mouseGripKey, String(holdMouse))
  } catch {
    // The preference still works for the current session.
  }
  updateHUD()
})
const builder = new BoardBuilder(builderDialog, (draft, editing) => {
  keyboard = false
  restingTip = ''
  if (!editing) zoom = 1
  if (draft !== board) applyBoard(draft)
  resize()
})
get('clear').addEventListener('click', () => {
  park()
  builder.open()
})
get('edit-layout').addEventListener('click', () => {
  park()
  builder.open(board)
})
get('sound').addEventListener('click', event => {
  sound = !sound
  event.currentTarget.innerHTML = icon(sound ? 'volume' : 'muted')
  event.currentTarget.title = sound ? 'Mute wrap sounds' : 'Unmute wrap sounds'
  event.currentTarget.setAttribute('aria-label', event.currentTarget.title)
})
get('reel').addEventListener('pointerdown', event => {
  event.preventDefault()
  if (event.pointerType === 'touch' && pull) activePull(pull.hand, true)
})
get('reel').addEventListener('click', event => {
  if (event.pointerType !== 'touch' && pull) activePull(pull.hand, true)
})
get('zoom-out').addEventListener('click', () => { park(); zoom = Math.max(0.8, zoom - 0.1); resize() })
get('zoom-in').addEventListener('click', () => { park(); zoom = Math.min(1.2, zoom + 0.1); resize() })
get('fit').addEventListener('click', () => { park(); zoom = 1; resize() })
swatches.forEach(swatch => swatch.addEventListener('click', () => setColor(Number(swatch.dataset.color))))

if (bench) new ResizeObserver(resize).observe(stage)
resize()
renderBoard()
persist()

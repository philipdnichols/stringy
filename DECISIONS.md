# Stringwork decision log

## Prototype

The workbench is a local Three.js browser game. Run `npm install` once and `npm run dev`, then open the address Vite prints. Use `npm test` for the winding checks and `npm run build` for a static production build.

| Decision | Reason |
| --- | --- |
| Use 32 nails on a fixed round board, with an editable two-color rosette on first launch. | The circle supports recognizable patterns and keeps every nail reachable at the default zoom. The marked end gives the player an immediate place to grip. **New board** clears the rosette and can be undone. |
| Set a taut wrap after exactly one full revolution in either direction. | The dot marks the start of the turn and the guide shows net degrees. Changing directions unwinds that progress. The hand can vary its distance from the nail within the winding area. A path through the shaft starts the turn over. Keyboard players grip with **Enter** and wind with **Q/E**. |
| Give the spool light drag during approach and hold the paid-out length after the catch. | A steady outward pull approaches 63 on the tension scale. A small amount of spool take-up absorbs ordinary variation at the catch. Larger slack and excess tension still need correction. The live lead carries forward so the player can keep winding in the same drag. |
| Set the wrap from 43 to 88 on the tension scale after the full turn. | When tension is already green at 360°, the wrap sets immediately. A completed turn with slack or excess tension holds its nail while the player keeps their grip and adjusts with the hand, **Space**, or **Take up slack**. |
| Draw the active turn as a preview and commit a full coil when it sets. | Tangent chords, a sticky exit contact, and a gradual preview keep the thread following the hand. A full coil rises slightly around the shaft. The amber ring marks a completed turn that needs tension and the pluck confirms a set wrap. |
| Park the strand when the player releases their grip. Tie it off to move on, or select a new color to tie off and switch. | Release keeps completed wraps and makes it easy to resume. Undo and redo cover completed wraps, anchor knots, tie-offs, color changes, and board resets. |
| Offer the same winding rules on mouse, touch, and keyboard. Save completed work in browser storage. | The artwork can survive a reload and the controls are usable without a precision mouse. The live grip is transient. |
| Default mouse input to click-to-grip and offer **Hold mouse to drag** in the tension panel. | Clicking once picks up the strand so the player can move freely. A second click or Escape parks it. The preference is saved separately from the board and applies to mouse input. Touch and pen use press-and-hold. |

## Model limits

Tension is a gameplay scale based on paid-out length and the active route. Guided contact helps the player place the thread before a free line would naturally bear against the shaft. Committed chords use tangent paths, small amounts of sag, and capped visual clearance at crossings. Their shape stays fixed once locked. Force propagation through the finished artwork, nail bending, and thread breakage are outside this prototype.

The board record includes the color, contact order, winding angles, committed tension, and approximate relaxed length of each span. History lasts for the current session. The board persists on the current browser and origin.

## Publishing

The GitHub Pages workflow uses the same artifact deployment as Mint Works. It runs the tests and Vite build before uploading `dist`, then deploys that artifact from `main`. Vite emits relative asset URLs so the workbench and its icon load under a repository subpath. The repository's Pages publishing source is GitHub Actions.

## Board builder

- **New board** opens a draft with a shape picker, a freehand drawing tool, and nail placement. Presets include typical woodworking shapes, a heart and a star, and simplified Texas and California silhouettes. The edge-nail tool fills available spots along the outline and leaves hand-placed nails in place.
- A sketch becomes one closed, solid wooden outline. The builder closes it on release, simplifies hand jitter, and fits it to the workbench. An outline with crossing edges asks for a redraw. Nail centers need clearance from the edge and enough spacing for the winding gesture.
- **Edit layout** can add, move, or remove unused nails. Once a strand is anchored, the outline and the nails carrying thread are held in place so existing artwork stays aligned with the wood.
- The outline and nail coordinates save alongside the strands. Older saves are assigned the original round outline and nail ring. The builder has draft undo, and workbench undo can restore the previous board after a new layout is applied.
- The spool feeds while the player winds. A taut full turn sets immediately, so a slow pull on a slack catch will usually set the wrap before it can go too tight. A sharp pull can jump past the green range while adjusting a completed slack turn, and easing inward can recover it.

## Playtest findings

- The original angle-only lock could complete a wrap during a straight pass close to a nail. A later shorter curved gesture could lock before the player finished circling. The current trigger is 360° of net rotation around the same nail. Green tension lets that turn set in the same drag.
- Automated checks cover tight, wide, uneven, and sparsely sampled turns in both directions. They assert that a turn just shy of 360° stays a preview and that returning to the start completes the coil. They also exercise shaky straight passes, reversals, center cuts, tangent paths, and tension corrections.
- Mouse and emulated touch checks confirmed that releasing at 355° discards the preview. At 360°, a taut wrap sets immediately and a slack wrap waits for tension. Browser checks also covered two completed mouse turns in one drag, a full keyboard turn, and save-on-reload.
- Board builder playtests used pointer and emulated touch to sketch an outline, place nails, and reopen a saved board. Desktop checks also covered preset edge nails, moving and removing unused nails, winding on a custom layout, old-save migration, and a slack catch recovering from a sharp over-pull.
- Mouse checks completed a full turn after the first click was released, parked with a second click or Escape, and restored each grip setting after reload. Emulated touch still wound while pressed and parked on release.

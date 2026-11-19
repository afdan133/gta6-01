// Keyboard + mouse input.
//
// Held keys live in a Set of lowercase `KeyboardEvent.code` values. Edge-triggered presses are
// queued separately and drained once per simulation step (`consume`), so a tap that happens
// between two frames is never lost. The mouse position is tracked in canvas (CSS) pixels; the
// main loop converts it to world pixels with the camera transform.

const MOVE_CODES = new Set([
  'keyw', 'keys', 'keya', 'keyd',
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
]);

// Only these keys are tracked at all — anything else (browser shortcuts, typing) is ignored.
const BOUND_CODES = new Set([
  ...MOVE_CODES,
  'space', 'keye', 'keyf', 'keym', 'keyq', 'enter', 'f5', 'f9',
  'shiftleft', 'shiftright', 'digit1', 'digit2', 'digit3',
]);

// Keys the page itself uses; stop the browser from scrolling or reloading on them.
function shouldPreventDefault(code) {
  return code === 'space' || code === 'f5' || MOVE_CODES.has(code);
}

export function createInput(canvas) {
  const down = new Set();     // currently held
  const pressed = new Set();  // pressed since the last consume()
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  function trackMouse(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  }

  function onKey(e, isDown) {
    const code = e.code.toLowerCase();
    if (!BOUND_CODES.has(code)) return;
    if (shouldPreventDefault(code) && e.preventDefault) e.preventDefault();
    if (!isDown) {
      down.delete(code);
      return;
    }
    // Ignore auto-repeat: a key that is already held is not a new press.
    if (!down.has(code)) pressed.add(code);
    down.add(code);
  }

  const handlers = {
    keydown: (e) => onKey(e, true),
    keyup: (e) => onKey(e, false),
    mousemove: trackMouse,
    mouseup: () => { mouse.down = false; },
    blur: () => { down.clear(); mouse.down = false; },  // don't leave keys stuck on tab-away
  };

  window.addEventListener('keydown', handlers.keydown);
  window.addEventListener('keyup', handlers.keyup);
  window.addEventListener('mousemove', handlers.mousemove);
  window.addEventListener('mouseup', handlers.mouseup);
  window.addEventListener('blur', handlers.blur);

  canvas.addEventListener('mousedown', (e) => {
    trackMouse(e);
    mouse.down = true;
    mouse.clicked = true;
    if (e.preventDefault) e.preventDefault();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    down,
    mouse,
    isDown(code) { return down.has(code.toLowerCase()); },
    pressed(code) { return pressed.has(code.toLowerCase()); },

    /** Movement axes in [-1, 1]; both WASD and the arrow keys work. */
    axes() {
      const right = this.isDown('keyd') || this.isDown('arrowright') ? 1 : 0;
      const left = this.isDown('keya') || this.isDown('arrowleft') ? 1 : 0;
      const downKey = this.isDown('keys') || this.isDown('arrowdown') ? 1 : 0;
      const up = this.isDown('keyw') || this.isDown('arrowup') ? 1 : 0;
      return { x: right - left, y: downKey - up };
    },

    /** True while either shift key is held (on-foot sprint). */
    running() { return this.isDown('shiftleft') || this.isDown('shiftright'); },

    /** Clear per-frame edge state; call once after each simulation step. */
    consume() { pressed.clear(); mouse.clicked = false; },
  };
}

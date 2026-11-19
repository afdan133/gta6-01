// Input handling: keyboard + mouse.
//
// Held keys sit in a Set of `event.code` strings (lowercased). Presses that happen
// between simulation steps are buffered in a second Set and drained by consume(),
// so quick taps are never missed even at low frame rates. Mouse position is stored
// in canvas-space pixels; main.js turns it into world coordinates via the camera.

const MOVEMENT = ['keyw', 'keya', 'keys', 'keyd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

// Everything the game listens for; other keys fall through to the browser.
const TRACKED = new Set([
  ...MOVEMENT,
  'space', 'enter', 'keye', 'keyf', 'keym', 'keyq', 'f5', 'f9',
  'shiftleft', 'shiftright', 'digit1', 'digit2', 'digit3',
]);

const SCROLLERS = new Set([...MOVEMENT, 'space']);

export function createInput(canvas) {
  const held = new Set();
  const tapped = new Set();
  const mouse = { x: 0, y: 0, button: false, click: false };

  const updateMouse = (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  };

  const handleKey = (e, wentDown) => {
    const code = (e.code || '').toLowerCase();
    if (!TRACKED.has(code)) return;
    if (wentDown && SCROLLERS.has(code) && e.preventDefault) e.preventDefault();
    if (wentDown) {
      if (!held.has(code)) tapped.add(code);
      held.add(code);
    } else {
      held.delete(code);
    }
  };

  const onKeyDown = (e) => handleKey(e, true);
  const onKeyUp = (e) => handleKey(e, false);
  const onMove = (e) => updateMouse(e);
  const onUp = () => { mouse.button = false; };
  const onBlur = () => {
    held.clear();
    mouse.button = false;
  };
  const onDown = (e) => {
    updateMouse(e);
    mouse.button = true;
    mouse.click = true;
    if (e.preventDefault) e.preventDefault();
  };
  const noMenu = (e) => e.preventDefault();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('contextmenu', noMenu);

  return {
    held,
    mouse,

    isDown(code) {
      return held.has(String(code).toLowerCase());
    },

    wasPressed(code) {
      return tapped.has(String(code).toLowerCase());
    },

    axes() {
      const x = (this.isDown('keyd') || this.isDown('arrowright') ? 1 : 0)
        - (this.isDown('keya') || this.isDown('arrowleft') ? 1 : 0);
      const y = (this.isDown('keys') || this.isDown('arrowdown') ? 1 : 0)
        - (this.isDown('keyw') || this.isDown('arrowup') ? 1 : 0);
      return { x, y };
    },

    sprinting() {
      return this.isDown('shiftleft') || this.isDown('shiftright');
    },

    consume() {
      tapped.clear();
      mouse.click = false;
    },
  };
}

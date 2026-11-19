// Keyboard + mouse input. Keys are held in a Set of lowercase codes; the mouse position is
// tracked in canvas (CSS) pixels and converted to world pixels by the main loop. Edge-triggered
// presses are queued and consumed once per frame so a press between frames is never lost.

const MOVE_CODES = new Set(['keyw', 'keys', 'keya', 'keyd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
const INTERESTING = new Set([...MOVE_CODES, 'space', 'keye', 'keyf', 'keym', 'f5', 'enter', 'keyq']);

export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  function onKey(e, isDown) {
    const code = e.code.toLowerCase();
    if (INTERESTING.has(code)) {
      if (code === 'space' || code === 'f5' || MOVE_CODES.has(code)) e.preventDefault();
      if (isDown) {
        if (!down.has(code)) pressed.add(code);
        down.add(code);
      } else {
        down.delete(code);
      }
    }
  }

  const kd = (e) => onKey(e, true);
  const ku = (e) => onKey(e, false);
  const mm = (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  };
  const md = (e) => { mm(e); mouse.down = true; mouse.clicked = true; e.preventDefault(); };
  const mu = () => { mouse.down = false; };
  const blur = () => { down.clear(); mouse.down = false; };
  const ctx = (e) => e.preventDefault();

  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('mousemove', mm);
  canvas.addEventListener('mousedown', md);
  window.addEventListener('mouseup', mu);
  window.addEventListener('blur', blur);
  canvas.addEventListener('contextmenu', ctx);

  return {
    down,
    mouse,
    isDown(code) { return down.has(code.toLowerCase()); },
    pressed(code) { return pressed.has(code.toLowerCase()); },
    axes() {
      const x = (this.isDown('keyd') || this.isDown('arrowright') ? 1 : 0)
        - (this.isDown('keya') || this.isDown('arrowleft') ? 1 : 0);
      const y = (this.isDown('keys') || this.isDown('arrowdown') ? 1 : 0)
        - (this.isDown('keyw') || this.isDown('arrowup') ? 1 : 0);
      return { x, y };
    },
    consume() { pressed.clear(); mouse.clicked = false; },
  };
}

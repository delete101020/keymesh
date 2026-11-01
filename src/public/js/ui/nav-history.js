// Ties the panes of a narrow screen to browser history, so Android's Back follows them. App state stays
// the source of truth and changes at once; history follows behind. Entries hold a depth and nothing else:
// the URL never changes and no entry names an item.
const DEPTH = { nav: 0, list: 1, detail: 2 };
const EDGE_PX = 24;
const SWIPE_PX = 60;

export const narrowQuery = (win = window) => win.matchMedia('(max-width: 899px)');

export function bindNavHistory(app, { win = window } = {}) {
  const { history, document } = win;
  const narrow = narrowQuery(win);
  const stack = ['nav'];
  let popping = 0;

  const inMain = () => app.state.screen === 'main';

  function sync() {
    if (popping) return; // A pop is on its way; the popstate handler comes back here.
    if (inMain() && !narrow.matches) return; // All panes are on screen, so Back has nothing to step through.
    const target = inMain() ? app.state.pane : 'nav';
    const top = stack.length - 1;
    if (stack[top] === target) return;
    let keep = top;
    while (keep > 0 && DEPTH[stack[keep]] > DEPTH[target]) keep--;
    if (keep < top) {
      stack.length = keep + 1;
      popping++;
      history.go(keep - top);
      return;
    }
    stack.push(target);
    history.pushState({ km: stack.length - 1 }, '');
  }

  // A Back the user asked for: the top dialog first, then one pane.
  function goBack() {
    const open = [...document.querySelectorAll('dialog[open]')].at(-1);
    if (open) open.dispatchEvent(new Event('cancel', { cancelable: true }));
    else if (app.state.pane !== 'nav') app.back();
  }

  win.addEventListener('popstate', (e) => {
    if (popping) {
      popping--;
      sync();
      return;
    }
    if (!inMain()) return;
    const at = e.state?.km ?? 0;
    const top = stack.length - 1;
    if (at > top) {
      popping++;
      history.go(top - at); // Forward leads to panes that no longer apply.
      return;
    }
    if (at === top) return;
    // Put the entries back and then act, so a Back that is refused (a draft kept) changes nothing.
    for (let i = at + 1; i <= top; i++) history.pushState({ km: i }, '');
    goBack();
  });

  let swipe = null;
  win.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    swipe = e.touches.length === 1 && t.clientX <= EDGE_PX && inMain() && narrow.matches ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  win.addEventListener('touchend', (e) => {
    if (!swipe) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipe.x;
    if (dx >= SWIPE_PX && Math.abs(t.clientY - swipe.y) < dx / 2) goBack();
    swipe = null;
  }, { passive: true });

  narrow.addEventListener('change', sync);
  app.on((regions) => {
    if (regions.includes('pane') || regions.includes('screen')) sync();
  });

  // A reload lands on whatever entry was current; return to the bottom so old entries cannot be walked back into.
  const landed = history.state?.km ?? 0;
  if (landed > 0) {
    popping++;
    history.go(-landed);
  } else {
    history.replaceState({ km: 0 }, '');
  }
}

import { reduceMotion, symbols } from './appearance.js';
import { spriteSrc } from './page.js';

  /* ====================================================================
     easter eggs. Each block below is independent — delete any one of them
     and nothing else breaks. The two shared helpers come first.
     ==================================================================== */

  // shared: a small sparkle burst over an element (or the whole viewport).
  // Nothing is injected at all under reduced motion.
  function burst(target, n){
    if (reduceMotion.matches) return;
    const r = target === document.body
      ? { left: 0, top: 0, width: innerWidth, height: innerHeight }
      : target.getBoundingClientRect();
    for (let i = 0; i < n; i++){
      const s = document.createElement('div');
      s.className = 'pop';
      s.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      s.style.left = (r.left + Math.random() * r.width) + 'px';
      s.style.top = (r.top + Math.random() * r.height) + 'px';
      s.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px');
      s.style.animationDelay = (Math.random() * 0.25) + 's';
      s.addEventListener('animationend', () => s.remove());
      document.body.appendChild(s);
    }
  }

  // shared: one small dismissible toast at a time
  function toast(message){
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = message;
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'toast-x';
    x.setAttribute('aria-label', 'dismiss');
    x.textContent = '×';
    x.addEventListener('click', () => t.remove());
    t.appendChild(x);
    document.body.appendChild(t);
  }


  // ---- easter egg 1: shiny odds -----------------------------------------
  // One roll per load at 1 in 64. On a hit, a random pokémon in the favourites
  // row (never the dream-shinies row, they're shiny already) turns shiny.
  (function(){
    const KEY = 'kitalina:shinies';
    const row = document.getElementById('pokeFaves');
    if (!row) return;

    let found = parseInt(localStorage.getItem(KEY), 10) || 0;
    const imgs = [...row.querySelectorAll('img[data-id]')];

    if (imgs.length && Math.floor(Math.random() * 64) === 0){
      const img = imgs[Math.floor(Math.random() * imgs.length)];
      img.src = spriteSrc(img.dataset.id, true, false);
      img.dataset.shiny = '1';
      img.title = "shiny! 1 in 64 here — don't tell anyone the real odds are 1 in 4096";
      burst(img, 10);
      found++;
      try { localStorage.setItem(KEY, found); } catch(e){}
    }

    if (found > 0){
      const note = document.createElement('p');
      note.className = 'shiny-count';
      note.textContent = `✨ you've found ${found} shiny here`;
      row.after(note);
    }
  })();


  // ---- easter egg 2: konami code ----------------------------------------
  // Every sprite goes shiny at once. Deliberately does NOT touch the counter —
  // that would be cheating. Press it again to put everything back.
  (function(){
    const CODE = ['arrowup','arrowup','arrowdown','arrowdown',
                  'arrowleft','arrowright','arrowleft','arrowright','b','a'];
    let pos = 0, on = false;

    addEventListener('keydown', e => {
      const key = (e.key || '').toLowerCase();
      pos = key === CODE[pos] ? pos + 1 : (key === CODE[0] ? 1 : 0);
      if (pos < CODE.length) return;
      pos = 0;
      on = !on;

      document.querySelectorAll('.spr img[data-id]').forEach(img => {
        // data-shiny marks the ones that are natively shiny (the dream row, plus
        // anything egg 1 turned up) — those stay shiny when this is switched off
        img.src = spriteSrc(img.dataset.id, on || img.dataset.shiny === '1', false);
      });
      burst(document.body, 26);
      toast(on ? '✨ everything is shiny' : 'back to normal');
    });
  })();


  // ---- easter egg 3: Bit's eyes follow the cursor -------------------------
  (function(){
    if (reduceMotion.matches || matchMedia('(pointer: coarse)').matches) return;
    const eyes = [...document.querySelectorAll('.bit-eye')];
    const sprite = document.querySelector('.bit-flip');
    if (!eyes.length || !sprite) return;

    let px = 0, py = 0, queued = false;
    addEventListener('pointermove', e => {
      px = e.clientX; py = e.clientY;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const r = sprite.getBoundingClientRect();
        // clamped to +-1 unit of the 16x16 viewBox, i.e. one sprite pixel
        const dx = Math.max(-1, Math.min(1, (px - (r.left + r.width / 2)) / 110));
        const dy = Math.max(-1, Math.min(1, (py - (r.top + r.height / 2)) / 110));
        eyes.forEach(el => el.setAttribute(
          'transform', `translate(${dx.toFixed(2)} ${dy.toFixed(2)})`));
      });
    }, { passive: true });
  })();


  // ---- easter egg 4: pet Bit ----------------------------------------------
  // .bit-flip is a real <button> with a label, so this works from the keyboard
  // too; the track around it stays pointer-events: none.
  (function(){
    const sprite = document.querySelector('.bit-flip');
    if (!sprite) return;
    const svg = sprite.querySelector('svg');

    sprite.addEventListener('click', () => {
      if (reduceMotion.matches) return;

      sprite.classList.remove('hop');
      void svg.offsetWidth;                 // reflow, so the hop can retrigger
      sprite.classList.add('hop');

      const r = sprite.getBoundingClientRect();
      const hearts = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < hearts; i++){
        const h = document.createElement('div');
        h.className = 'heart-pop';
        h.textContent = '♡';
        h.style.left = (r.left + r.width / 2 + (Math.random() * 22 - 11)) + 'px';
        h.style.top = r.top + 'px';
        h.style.animationDelay = (i * 0.09) + 's';
        h.addEventListener('animationend', () => h.remove());
        document.body.appendChild(h);
      }
    });
  })();


  // ---- easter egg 5: Bit sleeps -------------------------------------------
  // 60s with no input and it sits down. Pausing (rather than stopping) the
  // animations means it picks the walk back up exactly where it left off.
  // Typing the word "sleep" anywhere on the page forces the same nap early
  // and holds it for a fixed 10s, ignoring activity until that timer is up —
  // otherwise the mouse move that finished typing "sleep" would wake it
  // again on the very next frame.
  (function(){
    const IDLE_MS = 60000;
    const FORCED_SLEEP_MS = 10000;
    const slider = document.querySelector('.bit');
    const sprite = document.querySelector('.bit-flip');
    if (!slider || !sprite) return;
    const legs = [...document.querySelectorAll('.bit-leg')];
    let timer, forcedTimer, asleep = false, forced = false;

    function setPaused(state){
      [slider, sprite, ...legs].forEach(el => { el.style.animationPlayState = state; });
    }

    function sleep(){
      if (asleep) return;
      asleep = true;
      setPaused('paused');
      if (reduceMotion.matches) return;
      const z = document.createElement('span');
      z.className = 'zzz';
      z.textContent = 'z z z';
      slider.appendChild(z);            // on the slider, not the sprite, so the
    }                                   // scaleX flip never mirrors the text

    function wake(){
      if (forced) return;               // asleep-on-purpose; activity doesn't count
      if (asleep){
        asleep = false;
        setPaused('');
        const z = slider.querySelector('.zzz');
        if (z) z.remove();
      }
      clearTimeout(timer);
      timer = setTimeout(sleep, IDLE_MS);
    }

    function forceSleep(){
      forced = true;
      clearTimeout(timer);
      sleep();
      clearTimeout(forcedTimer);
      forcedTimer = setTimeout(() => { forced = false; wake(); }, FORCED_SLEEP_MS);
    }

    ['pointermove','pointerdown','keydown','scroll','wheel','touchstart']
      .forEach(ev => addEventListener(ev, wake, { passive: true }));
    wake();

    // typed word, not a keybind: no modifier keys, and only plain letter keys
    // move the buffer along so an arrow key or a shortcut can't fake a match.
    const WORD = 'sleep';
    let typed = '';
    addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      typed = (typed + e.key.toLowerCase()).slice(-WORD.length);
      if (typed === WORD) forceSleep();
    });
  })();


  // ---- easter egg 7: tab-blur title --------------------------------------
  (function(){
    const original = document.title;
    const away = () => { document.title = 'come back :('; };
    const back = () => { document.title = original; };
    addEventListener('blur', away);
    addEventListener('focus', back);
    document.addEventListener('visibilitychange',
      () => (document.hidden ? away() : back()));
  })();


  // ---- easter egg 8: console greeting ------------------------------------
  (function(){
    const accent = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent').trim() || '#8fcbb0';
    console.log(
      '%c        ▓▓▓▓      ▓▓▓▓\n        ▓▓▓▓      ▓▓▓▓\n        ████████████████\n' +
      '░░░░    ████████████████\n░░░░    ██  ████████  ██\n  ░░░░  ████▒▒▒▒▒▒▒▒████\n' +
      '  ░░░░  ████▒▒▒▒▒▒▒▒████\n        ████▒▒▒▒▒▒▒▒████\n        ████▒▒▒▒▒▒▒▒████\n' +
      '          ████    ████\n          ████    ████\n' +
      '%c\nhai :) hand-written html, no build step, no framework.\nthere are a few things hidden in here. ↑↑↓↓←→←→BA\n',
      'color:' + accent + ';font-family:monospace;font-size:9px;line-height:1.05',
      'color:' + accent + ';font-family:monospace;font-size:12px'
    );
  })();

  // One shared motion query for the whole page. Everything below checks it.
  export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // ---- easter egg 9: birthday mode --------------------------------------
  // October 5, from the bio table. Fully automatic — nothing to remember to
  // switch on. Runs before the sparkles so it can swap the glyph set.
  export let symbols = ['✦','✧','♡','･'];
  (function(){
    const now = new Date();
    if (now.getMonth() !== 9 || now.getDate() !== 5) return;   // months are 0-based
    symbols = ['🎉','🎊','✨','🎈'];
    const banner = document.createElement('p');
    banner.className = 'bday';
    banner.textContent = "🎂 it's kit's birthday today !!";
    document.querySelector('header.hero .aka').after(banner);
  })();

  // ambient floating sparkles
  // Gated here and not only in CSS: killing the animation alone would leave 18
  // position:fixed divs with no `top`, parked at their flow position forever.
  if (!reduceMotion.matches){
    const container = document.body;
    const count = window.innerWidth < 600 ? 10 : 18;
    for (let i = 0; i < count; i++){
      const el = document.createElement('div');
      el.className = 'sparkle';
      el.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      el.style.left = Math.random() * 100 + 'vw';
      el.style.animationDuration = (14 + Math.random() * 14) + 's';
      el.style.animationDelay = (Math.random() * 14) + 's';
      el.style.fontSize = (0.8 + Math.random() * 1) + 'rem';
      container.appendChild(el);
    }
  }

  // kit's actual local time
  // America/Los_Angeles rather than a fixed offset, so this follows the pst/pdt
  // switch on its own. Hidden until it has a value, so JS off leaves the row
  // exactly as it was written.
  (function(){
    const el = document.getElementById('kitClock');
    if (!el || !window.Intl) return;
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
    function tick(){
      if (document.hidden) return;
      el.textContent = fmt.format(new Date()).toLowerCase() + ' for kit';
      el.hidden = false;
    }
    tick();
    setInterval(tick, 15000);
    document.addEventListener('visibilitychange', tick);
  })();

  // rain streaks, for the `rain` theme only. Same injection pattern as the
  // sparkles, so the same reduced-motion gate applies.
  function setRain(on){
    document.querySelectorAll('.raindrop').forEach(el => el.remove());
    if (!on || reduceMotion.matches) return;
    const drops = window.innerWidth < 600 ? 14 : 26;
    for (let i = 0; i < drops; i++){
      const el = document.createElement('div');
      el.className = 'raindrop';
      el.style.left = Math.random() * 100 + 'vw';
      el.style.height = (30 + Math.random() * 50) + 'px';
      el.style.opacity = 0.15 + Math.random() * 0.25;
      el.style.animationDuration = (3.5 + Math.random() * 3.5) + 's';
      el.style.animationDelay = (-Math.random() * 6) + 's';   // negative: already falling
      document.body.appendChild(el);
    }
  }

  // theme switcher
  // Every colour is a token, so a theme is just a data-theme attribute on <html>.
  // The initial value is set by the inline head script to avoid a flash.
  (function(){
    const KEY = 'kitalina:theme';
    const group = document.getElementById('themeSwitch');
    const meta = document.getElementById('themeColor');
    const btns = [...group.querySelectorAll('[role="radio"]')];

    function apply(theme, save){
      document.documentElement.setAttribute('data-theme', theme);
      btns.forEach(b => {
        const on = b.dataset.theme === theme;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;      // roving tabindex: one stop for the group
      });
      // read the accent back out of the cascade rather than keeping a second
      // copy of the palette in JS
      meta.content = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent').trim() || '#8fcbb0';
      setRain(theme === 'rain');
      if (save) try { localStorage.setItem(KEY, theme); } catch(e){}
    }

    group.addEventListener('click', e => {
      const b = e.target.closest('[role="radio"]');
      if (b) apply(b.dataset.theme, true);
    });

    group.addEventListener('keydown', e => {
      const i = btns.indexOf(document.activeElement);
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (i < 0 || !step) return;
      e.preventDefault();
      const next = btns[(i + step + btns.length) % btns.length];
      next.focus();
      apply(next.dataset.theme, true);
    });

    apply(document.documentElement.getAttribute('data-theme') || 'mint', false);
  })();


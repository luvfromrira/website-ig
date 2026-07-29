  // pokémon sprites
  // The names stay in the markup, so with JS off the two lists still read as the
  // plain text pills they always were. This map is the only place a dex id lives;
  // add a name to the <ul> and its id here and the row picks it up.
  const POKEDEX = {
    dewgong: 87,  spheal: 363,   umbreon: 197,  leafeon: 470, shinx: 403,
    zorua: 570,   sawsbuck: 586, deerling: 585, dratini: 147, sharpedo: 319,
    altaria: 334
  };

  // gen-V animated gifs, with the static png as the fallback
  export function spriteSrc(id, shiny, still){
    return 'assets/sprites/' + (shiny ? 'shiny/' : '') + id + (still ? '.png' : '.gif');
  }

  document.querySelectorAll('[data-sprites]').forEach(list => {
    const shiny = list.dataset.sprites === 'shiny';
    let built = 0;
    list.querySelectorAll('li').forEach(li => {
      const id = POKEDEX[li.textContent.trim().toLowerCase()];
      if (!id) return;
      const img = new Image(76, 80);          // sets width/height, so no layout shift
      img.alt = '';                           // decorative — the name is the caption
      img.loading = 'lazy';
      img.dataset.id = id;
      if (shiny) img.dataset.shiny = '1';
      // gif -> static png -> give up and leave just the caption.
      // never a broken-image icon.
      img.addEventListener('error', () => {
        if (img.dataset.fellBack){ img.remove(); return; }
        img.dataset.fellBack = '1';
        img.src = spriteSrc(id, shiny, true);
      });
      img.src = spriteSrc(id, shiny, false);
      li.prepend(img);
      li.classList.add('spr');
      built++;
    });
    if (built) list.classList.add('is-sprites');
  });

  // scroll reveal
  // Anything already on screen reveals on the observer's first callback, so the
  // top of the page doesn't sit blank waiting for a scroll event. The stagger is
  // per-batch: siblings arriving together fan out, one scrolled to alone doesn't.
  const sections = [...document.querySelectorAll('.wrap section')];
  if (document.documentElement.classList.contains('js-reveal')){
    if (!('IntersectionObserver' in window)){
      document.documentElement.classList.remove('js-reveal');   // no observer, no hiding
    } else {
      const revealObserver = new IntersectionObserver((entries, obs) => {
        entries.filter(e => e.isIntersecting).forEach((e, i) => {
          e.target.style.transitionDelay = (i * 60) + 'ms';
          e.target.classList.add('is-in');
          obs.unobserve(e.target);
        });
      }, { threshold: 0.1 });
      sections.forEach(s => revealObserver.observe(s));
    }
  }

  // active nav pill
  // All labels sit on an equal grid and one shared indicator travels between
  // them. Live measurements cover the two-row phone layout, zoom and font load
  // without hardcoded cell dimensions.
  (function(){
    const nav = document.querySelector('nav.pillnav');
    if (!nav) return;
    const links = [...nav.querySelectorAll('a')];
    const byId = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
    const targets = sections.filter(s => byId.has(s.id));
    if (!targets.length) return;

    const indicator = document.createElement('span');
    indicator.className = 'pillnav-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    nav.append(indicator);

    let current;
    let pendingTarget;
    let settleTimer;
    function placeIndicator(link){
      if (!link) return;
      const navRect = nav.getBoundingClientRect();
      const linkRect = link.getBoundingClientRect();
      nav.style.setProperty('--indicator-x', (linkRect.left - navRect.left) + 'px');
      nav.style.setProperty('--indicator-y', (linkRect.top - navRect.top) + 'px');
      nav.style.setProperty('--indicator-w', linkRect.width + 'px');
      nav.style.setProperty('--indicator-h', linkRect.height + 'px');
    }
    function setActive(id){
      const active = byId.get(id);
      if (id === current){
        placeIndicator(active);
        return;
      }
      current = id;
      links.forEach(a => {
        const on = a === active;
        a.classList.toggle('is-active', on);
        if (on) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      });
      placeIndicator(active);
      nav.classList.toggle('has-active', !!active);
    }

    function releasePendingTarget(){
      if (!pendingTarget) return;
      pendingTarget = null;
      clearTimeout(settleTimer);
      settleTimer = null;
      pick();
    }
    function armScrollSettle(){
      clearTimeout(settleTimer);
      // `scrollend` is the precise path in current browsers; this debounce is
      // the fallback for older Safari versions and interrupted smooth scrolls.
      settleTimer = setTimeout(releasePendingTarget, 180);
    }

    links.forEach(link => {
      link.addEventListener('click', () => {
        pendingTarget = link.getAttribute('href').slice(1);
        setActive(pendingTarget);
        armScrollSettle();
      });
    });

    function pick(){
      // A deliberate navigation choice wins over the sections briefly crossed
      // during smooth scrolling. Normal scroll-spy behaviour resumes on settle.
      if (pendingTarget){
        setActive(pendingTarget);
        return;
      }
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2){
        setActive(targets[targets.length - 1].id);
      } else {
        // The probe lives just under the sticky surface. As it passes a section,
        // selection hands off in document order. Above the first section there
        // is intentionally no current item.
        // Match the breathing room used by section scroll-margin-top. This
        // makes the destination active as soon as an anchor scroll settles,
        // rather than requiring one extra nudge of the wheel.
        const probe = scrollY + nav.getBoundingClientRect().bottom + 20;
        let active = null;
        targets.forEach(section => {
          if (section.offsetTop <= probe) active = section.id;
        });
        setActive(active);
      }
    }

    let queued = false;
    function queuePick(){
      if (queued) return;
      if (pendingTarget) armScrollSettle();
      queued = true;
      requestAnimationFrame(() => { queued = false; pick(); });
    }
    addEventListener('scroll', queuePick, { passive: true });
    addEventListener('scrollend', releasePendingTarget, { passive: true });
    addEventListener('resize', queuePick, { passive: true });
    if (document.fonts) document.fonts.ready.then(queuePick);
    pick();
  })();

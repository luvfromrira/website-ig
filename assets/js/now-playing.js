import { reduceMotion } from './appearance.js';

  // now playing widget: polls /api/nowplaying (Last.fm + Deezer preview proxy)
  // and plays the 30s preview via a plain <audio> element.
  (function(){
    const POLL_MS = 30000;
    const REQUEST_TIMEOUT_MS = 10000;

    const widget = document.getElementById('nowPlaying');
    const shell = widget.querySelector('.np-shell');
    const hit = document.getElementById('npToggle');
    const labelText = document.getElementById('npLabelText');
    const artEl = document.getElementById('npArt');
    const titleEl = document.getElementById('npTitle');
    const artistEl = document.getElementById('npArtist');
    const playBtn = document.getElementById('npPlayBtn');
    const playIcon = document.getElementById('npPlayIcon');
    const audio = document.getElementById('npAudio');

    let currentPreview = '';
    let activeRequest = null;
    let requestVersion = 0;

    /* ====================================================================
       THE SHAPE  —  capsule <-> card
       --------------------------------------------------------------------
       A single spring drives one number, `--t`, from 0 (capsule) to 1
       (card). The stylesheet derives width, height, corner radius, padding,
       artwork size and every fade from it, so the whole morph is one value
       moving and every property necessarily lands on the same frame.

       A spring, and not a CSS transition, because a spring is *resumable*:
       it always starts from wherever the widget currently is, at whatever
       speed it is currently moving. Tap to open and tap again halfway and
       it turns around from that exact point, carrying its velocity, with
       no jump and no waiting for the first animation to play itself out.
       ==================================================================== */

    // response = time to reach the target (not a duration; a spring has
    // none). zeta = damping: 1 settles dead, below 1 overshoots.
    // Opening is an expressive, forward action, so it is allowed a little
    // overshoot. Closing is a dismissal and should just go quiet.
    const OPEN  = { zeta: 0.72, resp: 0.42 };   // settles ~4% past, then back
    const CLOSE = { zeta: 1.00, resp: 0.30 };

    let t = 0, vel = 0, target = 0, raf = 0, lastT = 0, pinned = false;

    function writeT(v){ widget.style.setProperty('--t', v.toFixed(4)); }

    function tick(now){
      const dt = Math.min(0.032, (now - lastT) / 1000) || 0.016;
      lastT = now;

      const cfg = target === 1 ? OPEN : CLOSE;
      const w = 2 * Math.PI / cfg.resp;
      const k = w * w;
      const c = 2 * cfg.zeta * w;

      // two half-steps: keeps the integrator stable if a frame runs long,
      // which on a mid-range phone it regularly does
      const h = dt / 2;
      for (let i = 0; i < 2; i++){
        vel += (-k * (t - target) - c * vel) * h;
        t += vel * h;
      }
      writeT(t);

      if (Math.abs(t - target) < 0.0008 && Math.abs(vel) < 0.01){
        t = target; vel = 0; writeT(t);
        raf = 0;
        shell.style.willChange = '';
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    function setOpen(open, instant){
      if (pinned) open = true;
      target = open ? 1 : 0;
      widget.classList.toggle('np-open', open);
      hit.setAttribute('aria-expanded', String(open));
      syncPreviewControl();

      if (instant || reduceMotion.matches){
        cancelAnimationFrame(raf);
        raf = 0;
        t = target; vel = 0;
        writeT(t);
        shell.style.willChange = '';
        return;
      }
      if (!raf){
        lastT = performance.now();
        shell.style.willChange = 'width, height';
        raf = requestAnimationFrame(tick);
      }
    }
    function isOpen(){ return widget.classList.contains('np-open'); }

    // Opacity and pointer-events do not remove a control from keyboard
    // navigation. Keep the transport inert until the card is visibly open.
    function syncPreviewControl(){
      const interactive = isOpen() && Boolean(currentPreview);
      playBtn.disabled = !interactive;
      playBtn.tabIndex = interactive ? 0 : -1;
      playBtn.setAttribute('aria-hidden', String(!interactive));
    }

    // Feedback on press, not on release — waiting for the click to
    // acknowledge a tap is what makes a control feel dead.
    hit.addEventListener('pointerdown', () => shell.style.setProperty('--press', '0.97'));
    const unpress = () => shell.style.setProperty('--press', '1');
    ['pointerup', 'pointercancel', 'pointerleave', 'blur'].forEach(
      (ev) => hit.addEventListener(ev, unpress));

    hit.addEventListener('click', () => setOpen(!isOpen()));
    // keyboard focus opens it; the :focus-visible check is what stops a tap
    // (which also focuses) from opening and immediately re-closing it
    hit.addEventListener('focus', () => { if (hit.matches(':focus-visible')) setOpen(true); });

    // tapping the page, or Escape, puts it away again
    document.addEventListener('pointerdown', (e) => {
      if (pinned || !isOpen() || widget.contains(e.target)) return;
      setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || pinned || !isOpen()) return;
      setOpen(false);
      hit.focus();
    });

    // Above 1300px the left gutter is finally wide enough for the card not
    // to sit on the content column, so it is simply always open and there
    // is nothing left to toggle.
    const wide = matchMedia('(min-width: 1300px)');
    function syncPinned(){
      pinned = wide.matches;
      if (pinned) hit.setAttribute('tabindex', '-1');
      else hit.removeAttribute('tabindex');
      setOpen(pinned, true);
    }
    wide.addEventListener('change', syncPinned);
    syncPinned();

    const ICON_PLAY = '<polygon points="6,4 20,12 6,20" fill="currentColor"/>';
    const ICON_PAUSE = '<rect x="5" y="4" width="4" height="16" fill="currentColor"/><rect x="15" y="4" width="4" height="16" fill="currentColor"/>';

    function setPlayingIcon(isPlaying){
      playIcon.innerHTML = isPlaying ? ICON_PAUSE : ICON_PLAY;
      playBtn.setAttribute('aria-label', isPlaying ? 'Pause preview' : 'Play preview');
    }

    playBtn.addEventListener('click', () => {
      if (!currentPreview) return;
      if (audio.paused){
        const p = audio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } else {
        audio.pause();
      }
    });

    // ---- live waveform ---------------------------------------------------
    // Real analysis, not a canned animation: the preview is routed through an
    // AnalyserNode and the bars follow the actual signal. Deezer's preview CDN
    // sends `access-control-allow-origin: *`, which is what makes this legal.
    const waveBars = [...widget.querySelectorAll('.np-wave i')];
    const BANDS = 4;
    // bin ranges at fftSize 256 (~172Hz per bin): bass, low-mid, mid, high
    const BAND_RANGE = [[1, 4], [4, 10], [10, 24], [24, 60]];
    const BAND_TILT = [1.0, 1.15, 1.5, 2.0];   // offsets the natural HF rolloff
    const levels = new Array(BANDS).fill(0.14);

    let audioCtx, analyser, freq, waveRaf = 0;
    let synthetic = false, silentFrames = 0, corsRetried = false;
    let peakRef = 0.4;   // running loudness reference, see drawWave

    audio.loop = true;                 // the 30s preview repeats seamlessly
    audio.crossOrigin = 'anonymous';   // must be set before src, for analysis

    function initAnalyser(){
      if (audioCtx || synthetic || !window.AudioContext) return;
      try {
        audioCtx = new AudioContext();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.6;   // we do our own easing below
        freq = new Uint8Array(analyser.frequencyBinCount);
        audioCtx.createMediaElementSource(audio).connect(analyser);
        analyser.connect(audioCtx.destination);
      } catch(e){
        synthetic = true;
      }
    }

    function drawWave(){
      waveRaf = requestAnimationFrame(drawWave);
      const live = analyser && !synthetic;
      if (live) analyser.getByteFrequencyData(freq);
      let peak = 0;

      // getByteFrequencyData is dB-mapped, so loud music already sits near 255
      // and a fixed gain just pins every bar to the ceiling. Normalise against a
      // running loudness reference instead: fast to rise, slow to fall, so the
      // bars keep their full range on quiet tracks and loud ones alike.
      const raw = [];
      for (let i = 0; i < BANDS; i++){
        if (!live) break;
        const [lo, hi] = BAND_RANGE[i];
        let sum = 0;
        for (let j = lo; j < hi; j++) sum += freq[j];
        raw[i] = (sum / ((hi - lo) * 255)) * BAND_TILT[i];
        peak = Math.max(peak, raw[i]);
      }
      if (live){
        peakRef += (peak - peakRef) * (peak > peakRef ? 0.3 : 0.02);
        peakRef = Math.max(peakRef, 0.12);
      }

      for (let i = 0; i < BANDS; i++){
        let target;
        if (live){
          // gamma > 1 pushes the quiet moments further down, which is what gives
          // the bars their snap rather than a gentle wobble near the top
          target = Math.pow(Math.min(1, raw[i] / (peakRef * 1.02)), 1.7);
        } else {
          // two detuned sines, so the fallback never looks like it is looping
          const now = performance.now() / 1000;
          target = 0.45 + 0.34 * Math.sin(now * 5.5 + i * 1.9) * Math.sin(now * 2.1 + i * 0.7);
        }
        // ease toward the target — raw FFT frames on their own look like jitter
        levels[i] += (Math.min(1, Math.max(0.14, target)) - levels[i]) * 0.28;
      }

      // a tainted stream analyses as dead-flat zeros; switch over if that happens
      if (live){
        silentFrames = peak > 0.02 ? 0 : silentFrames + 1;
        if (silentFrames > 90) synthetic = true;
      }

      waveBars.forEach((bar, n) => {
        bar.style.transform = 'scaleY(' + levels[n % BANDS].toFixed(3) + ')';
      });
    }

    function startWave(){
      if (audio.muted) return;         // the silent autoplay-arming play() call
      levels.fill(0.14);               // so the bars grow up out of the unfurl
      peakRef = 0.4;
      widget.classList.add('np-audio');
      if (reduceMotion.matches) return;   // bars show, but held in a static shape
      initAnalyser();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      if (!waveRaf) drawWave();
    }

    function stopWave(){
      widget.classList.remove('np-audio');
      cancelAnimationFrame(waveRaf);
      waveRaf = 0;
    }

    // If a preview ever comes from a host that doesn't send CORS, crossOrigin
    // would break playback outright. Give up the analysis rather than the audio.
    audio.addEventListener('error', () => {
      if (corsRetried || !audio.crossOrigin || !currentPreview) return;
      corsRetried = true;
      synthetic = true;
      audio.removeAttribute('crossorigin');
      audio.src = currentPreview;
    });

    audio.addEventListener('play', () => { setPlayingIcon(true); startWave(); });
    audio.addEventListener('pause', () => { setPlayingIcon(false); stopWave(); });
    audio.addEventListener('ended', () => { setPlayingIcon(false); stopWave(); });

    /* ====================================================================
       CONTENT  —  and what happens when the track changes
       --------------------------------------------------------------------
       The poll runs every 30s, so the guard here matters: re-rendering
       identical data used to rebuild the marquee and restart its scroll
       from zero twice a minute. Nothing below touches the DOM unless the
       value it owns has genuinely changed.
       ==================================================================== */

    const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
    const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
    const canAnimate = () => !reduceMotion.matches && !!artEl.animate;

    // Sets text, then upgrades it to a scrolling marquee only if it actually
    // overflows. Measured after a frame so layout is settled.
    function setScrollingText(el, text){
      el.classList.remove('is-marquee');
      el.textContent = text;
      if (reduceMotion.matches) return;
      requestAnimationFrame(() => {
        if (el.dataset.value !== text) return;         // a newer track won the race
        if (el.scrollWidth - el.clientWidth <= 1) return;
        const a = document.createElement('span');
        a.textContent = text;
        const b = a.cloneNode(true);
        b.setAttribute('aria-hidden', 'true');
        el.replaceChildren(a, b);
        const dist = a.offsetWidth;                    // text + the trailing gap
        el.style.setProperty('--marquee-dist', dist + 'px');
        // the keyframes rest at both ends, so the travel is 82% of the cycle
        el.style.setProperty('--marquee-dur', Math.max(8, dist / 26).toFixed(1) + 's');
        el.classList.add('is-marquee');
      });
    }

    // A changed line lifts out and the new one rises into its place. The
    // artist trails the title by 45ms: one line moving after the other reads
    // as a considered swap, both at once reads as a glitch.
    function setLine(el, text, delay){
      if (el.dataset.value === text) return;
      const first = !el.dataset.value;
      el.dataset.value = text;
      if (first || !canAnimate()){ setScrollingText(el, text); return; }

      el.animate(
        [{ opacity: 1, transform: 'translateY(0)' },
         { opacity: 0, transform: 'translateY(-5px)' }],
        { duration: 150, delay: delay, easing: EASE_IN, fill: 'backwards' }
      ).finished.then(() => {
        if (el.dataset.value !== text) return;         // superseded mid-swap
        setScrollingText(el, text);
        el.animate(
          [{ opacity: 0, transform: 'translateY(6px)' },
           { opacity: 1, transform: 'translateY(0)' }],
          { duration: 380, easing: EASE_OUT }
        );
      }).catch(() => {});
    }

    // Decoded off-screen first: swapping .src directly would blank the
    // artwork for however long the new cover takes to arrive.
    let artUrl = null;
    function setArt(url){
      if (url === artUrl) return;
      const had = !!artUrl;
      artUrl = url;

      if (!url){
        widget.classList.add('np-noart');
        artEl.removeAttribute('src');
        return;
      }
      const pre = new Image();
      pre.onload = () => {
        if (artUrl !== url) return;
        widget.classList.remove('np-noart');
        if (!had || !canAnimate()){ artEl.src = url; return; }
        artEl.animate(
          [{ opacity: 1, transform: 'scale(1)' },
           { opacity: 0, transform: 'scale(0.92)' }],
          { duration: 160, easing: EASE_IN }
        ).finished.then(() => {
          if (artUrl !== url) return;
          artEl.src = url;
          artEl.animate(
            [{ opacity: 0, transform: 'scale(1.08)' },
             { opacity: 1, transform: 'scale(1)' }],
            { duration: 340, easing: EASE_OUT }
          );
        }).catch(() => {});
      };
      pre.onerror = () => {
        if (artUrl !== url) return;
        artUrl = '';
        widget.classList.add('np-noart');
        artEl.removeAttribute('src');
      };
      pre.src = url;
    }

    // Webfonts land after the first paint, so the overflow measurement that
    // decides "does this need a marquee" has to be taken again once they do.
    if (document.fonts && document.fonts.ready){
      document.fonts.ready.then(() => {
        [titleEl, artistEl].forEach((el) => {
          if (el.dataset.value) setScrollingText(el, el.dataset.value);
        });
      }).catch(() => {});
    }

    function hideWidget(){
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      currentPreview = '';
      setPlayingIcon(false);
      stopWave();
      playBtn.hidden = true;
      syncPreviewControl();
      if (!pinned) setOpen(false, true);
      widget.hidden = true;
      widget.classList.remove('np-ready');
    }

    function render(data){
      // easter egg 6: Bit picks up the pace only while something is
      // genuinely playing — not for the dimmed "last played" state. Set before
      // the early return so it also clears when the widget goes away.
      document.body.classList.toggle('np-live', !!(data && data.nowplaying && data.title));

      if (!data || !data.title || !data.artist){
        hideWidget();
        return;
      }

      if (widget.hidden){
        widget.hidden = false;
        // Two frames: one for the browser to apply the pre-entrance transform
        // now that the element is displayed, one to flip to the resting state so
        // the transition actually runs instead of the widget snapping into place.
        requestAnimationFrame(() => requestAnimationFrame(
          () => widget.classList.add('np-ready')));
      }

      setLine(titleEl, data.title, 0);
      setLine(artistEl, data.artist, 45);
      setArt(data.art || '');

      // state: currently playing vs. last scrobble (dimmed)
      widget.classList.toggle('np-dimmed', !data.nowplaying);
      labelText.textContent = data.nowplaying ? 'now playing' : 'last played';

      // state: no preview found -> no button, and the card is that much
      // narrower for it (--btnw is transitioned, so the width follows)
      const preview = data.preview || '';
      if (preview !== currentPreview){
        audio.pause();
        setPlayingIcon(false);
        currentPreview = preview;
        if (preview){
          audio.src = preview;
        } else {
          audio.removeAttribute('src');
          audio.load();
        }
      }
      playBtn.hidden = !preview;
      widget.classList.toggle('np-nopreview', !preview);
      syncPreviewControl();
    }

    async function fetchNowPlaying(){
      const version = ++requestVersion;
      if (activeRequest) activeRequest.abort();

      const controller = new AbortController();
      activeRequest = controller;
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const res = await fetch('/api/nowplaying', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('now playing request failed');
        const data = await res.json();
        if (version !== requestVersion) return;
        render(data);
      } catch (err) {
        // Keep the last successful state visible on transient failures. If this
        // is the first request, the widget was already hidden in the markup.
        if (!controller.signal.aborted) {
          console.warn('Unable to refresh now playing data.', err);
        }
      } finally {
        clearTimeout(timeout);
        if (activeRequest === controller) activeRequest = null;
      }
    }

    // Poll only while the tab is actually being looked at. Coming back refetches
    // immediately so you never see a stale track for up to 30s.
    let timer = null;
    function startPolling(){
      if (timer !== null) return;
      timer = setInterval(fetchNowPlaying, POLL_MS);
    }
    function stopPolling(){
      clearInterval(timer);
      timer = null;
      requestVersion++;
      if (activeRequest) activeRequest.abort();
      activeRequest = null;
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden){
        stopPolling();
      } else {
        fetchNowPlaying();
        startPolling();
      }
    });

    fetchNowPlaying();
    startPolling();
  })();


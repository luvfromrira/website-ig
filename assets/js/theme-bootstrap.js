  // Runs before the stylesheet, so nothing ever paints in the wrong state:
  // the theme has to be on <html> before any rule is applied or every load
  // flashes mint first, and the reveal flag has to be set before first paint.
  // If this script doesn't run, neither is set and the page is simply the
  // default palette with every section visible.
  (function(){
    try{
      var saved = localStorage.getItem('kitalina:theme');
      if (['mint','rain'].indexOf(saved) === -1) saved = null;
      // A stored choice always wins. With nothing stored we fall back to mint:
      // all four palettes are dark-background, so prefers-color-scheme has no
      // palette to point at, and mapping "light" onto one of them would just
      // mean most visitors never see the default palette.
      document.documentElement.setAttribute('data-theme', saved || 'mint');

      if (!matchMedia('(prefers-reduced-motion: reduce)').matches){
        document.documentElement.classList.add('js-reveal');
      }
    }catch(e){}
  })();

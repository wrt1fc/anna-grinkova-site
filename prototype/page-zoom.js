// Desktop pages are drawn at 1440 px in Figma. From 1281 px the page is scaled with the window width (CSS zoom on the header, main and footer),
// so it fills a wider screen instead of sitting in a box and shrinks a little on laptops. Below 1281 px the fluid rules stay in charge.
(function () {
  var root = document.documentElement;
  var BASE = 1440, MIN_WIDTH = 1281, MAX_ZOOM = 1.6;
  function apply() {
    var width = root.clientWidth;
    var zoom = width >= MIN_WIDTH ? Math.min(width / BASE, MAX_ZOOM) : 1;
    root.style.setProperty('--page-zoom', zoom.toFixed(4));
  }
  apply();
  window.addEventListener('resize', apply);
})();

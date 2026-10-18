// The demo reel on the home page: one box, one demo at a time, advancing on its own until the
// visitor touches it. Slides scroll sideways rather than being transformed, because a transformed
// ancestor would turn the demos' position:fixed tooltips into absolutely positioned ones.
(function () {
  var reel = document.getElementById("reel");
  if (!reel) return;
  var view = reel.querySelector(".reel-view");
  var slides = Array.prototype.slice.call(reel.querySelectorAll(".reel-slide"));
  var tabs = Array.prototype.slice.call(reel.querySelectorAll(".reel-tabs button"));
  var playBtn = document.getElementById("reel-play");
  var bar = reel.querySelector(".reel-progress i");
  var DWELL = 9000;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var at = 0;
  var playing = !reduce;   // the visitor's choice: false once they pause or engage with a demo
  var held = false;        // hovered or focused: a temporary hold
  var visible = true;      // on screen and in a visible tab
  var elapsed = 0, last = 0, raf = 0;

  function fit() {
    view.style.height = slides[at].offsetHeight + "px";
  }

  function go(i, smooth) {
    at = (i + slides.length) % slides.length;
    slides.forEach(function (s, j) {
      s.inert = j !== at;
      s.setAttribute("aria-hidden", String(j !== at));
    });
    tabs.forEach(function (t, j) {
      t.setAttribute("aria-selected", String(j === at));
      t.tabIndex = j === at ? 0 : -1;
    });
    view.scrollTo({ left: slides[at].offsetLeft, behavior: smooth && !reduce ? "smooth" : "auto" });
    fit();
    elapsed = 0;
    paintBar();
  }

  function paintBar() {
    bar.style.transform = "scaleX(" + Math.min(elapsed / DWELL, 1) + ")";
  }

  function running() { return playing && !held && visible; }

  function tick(now) {
    raf = 0;
    if (!running()) return;
    elapsed += last ? now - last : 0;
    last = now;
    if (elapsed >= DWELL) go(at + 1, true);
    paintBar();
    raf = requestAnimationFrame(tick);
  }

  function update() {
    playBtn.textContent = playing ? "Pause" : "Play";
    playBtn.setAttribute("aria-pressed", String(!playing));
    reel.classList.toggle("is-playing", running());
    last = 0;
    if (running() && !raf) raf = requestAnimationFrame(tick);
  }

  function stop() { playing = false; update(); }

  tabs.forEach(function (t, j) {
    t.addEventListener("click", function () { go(j, true); stop(); });
    t.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      go(at + d, true);
      stop();
      tabs[at].focus();
    });
  });
  document.getElementById("reel-prev").addEventListener("click", function () { go(at - 1, true); stop(); });
  document.getElementById("reel-next").addEventListener("click", function () { go(at + 1, true); stop(); });
  playBtn.addEventListener("click", function () { playing = !playing; elapsed = 0; update(); });

  // Hovering or focusing holds the reel; actually using a demo stops it for good.
  view.addEventListener("pointerenter", function () { held = true; update(); });
  view.addEventListener("pointerleave", function () { held = false; update(); });
  view.addEventListener("focusin", function () { held = true; update(); });
  view.addEventListener("focusout", function () { held = false; update(); });
  view.addEventListener("pointerdown", stop);
  view.addEventListener("input", stop);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting && !document.hidden; update(); })
      .observe(reel);
  }
  document.addEventListener("visibilitychange", function () { visible = !document.hidden; update(); });

  if ("ResizeObserver" in window) slides.forEach(function (s) { new ResizeObserver(fit).observe(s); });
  window.addEventListener("resize", function () { go(at, false); });

  // Old links point at a demo by id (index.html#contagion); open that slide and leave it there.
  function fromHash() {
    var target = location.hash && document.getElementById(location.hash.slice(1));
    var j = target ? slides.findIndex(function (s) { return s.contains(target); }) : -1;
    if (j < 0) return false;
    go(j, false);
    reel.scrollIntoView();
    stop();
    return true;
  }
  window.addEventListener("hashchange", fromHash);
  if (!fromHash()) go(0, false);
  update();
})();

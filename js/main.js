/* THE TOOTA GROUP — shared site behavior */
(function () {
  "use strict";

  /* Mobile nav */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", nav.classList.contains("open") ? "true" : "false");
    });
  }

  /* Reveal on scroll */
  var revealed = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealed.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    revealed.forEach(function (el) { io.observe(el); });
  } else {
    revealed.forEach(function (el) { el.classList.add("in"); });
  }

  /* Footer year */
  var yr = document.getElementById("year");
  if (yr) yr.textContent = new Date().getFullYear();

  /* ==========================================================
     Interactive RunFlat installation demo
     Used on installation.html (and the teaser can link to it).
     Steps are declared in the page as JSON in #demo-data.
     SVG elements tagged data-step="n" appear at step n and stay
     visible unless data-until="m" hides them at step m.
     Segments with class .seg and data-in-transform slide into
     place when their step activates.
     ========================================================== */
  var demoEl = document.querySelector("[data-demo]");
  if (!demoEl) return;

  var dataEl = document.getElementById("demo-data");
  var steps;
  try { steps = JSON.parse(dataEl.textContent); } catch (e) { return; }

  var stage = demoEl.querySelector(".demo-stage svg");
  var titleEl = document.getElementById("demo-step-title");
  var textEl = document.getElementById("demo-step-text");
  var labelEl = document.getElementById("demo-step-label");
  var progress = demoEl.querySelectorAll(".demo-progress i");
  var btnPrev = document.getElementById("demo-prev");
  var btnNext = document.getElementById("demo-next");
  var btnPlay = document.getElementById("demo-play");

  var current = 0;
  var timer = null;
  var PLAY_MS = 3400;

  function render() {
    var s = steps[current];
    labelEl.textContent = "Step " + (current + 1) + " of " + steps.length;
    titleEl.textContent = s.title;
    textEl.textContent = s.text;

    progress.forEach(function (bar, i) {
      bar.classList.toggle("on", i <= current);
    });

    stage.querySelectorAll("[data-step]").forEach(function (el) {
      var from = parseInt(el.getAttribute("data-step"), 10);
      var until = el.hasAttribute("data-until") ? parseInt(el.getAttribute("data-until"), 10) : Infinity;
      var vis = current + 1 >= from && current + 1 < until;
      el.classList.toggle("vis", vis);
      if (el.classList.contains("seg")) {
        var inT = el.getAttribute("data-in-transform") || "";
        var outT = el.getAttribute("data-out-transform") || "";
        el.style.transform = vis ? inT : outT;
      }
    });

    btnPrev.disabled = current === 0;
    btnNext.textContent = current === steps.length - 1 ? "Restart" : "Next Step";
  }

  function go(n, userInitiated) {
    current = (n + steps.length) % steps.length;
    if (userInitiated) stopPlay();
    render();
  }

  function stopPlay() {
    if (timer) { clearInterval(timer); timer = null; }
    btnPlay.textContent = "▶ Auto-Play";
  }

  btnPrev.addEventListener("click", function () { go(current - 1, true); });
  btnNext.addEventListener("click", function () { go(current + 1, true); });
  btnPlay.addEventListener("click", function () {
    if (timer) { stopPlay(); return; }
    btnPlay.textContent = "❚❚ Pause";
    if (current === steps.length - 1) go(0);
    timer = setInterval(function () {
      if (current === steps.length - 1) { stopPlay(); return; }
      go(current + 1);
    }, PLAY_MS);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") go(current + 1, true);
    if (e.key === "ArrowLeft") go(current - 1, true);
  });

  render();
})();

/* Exploded-view slider (wheel-assemblies.html) */
(function () {
  "use strict";
  document.querySelectorAll("input[data-explode]").forEach(function (slider) {
    var svg = document.querySelector(slider.getAttribute("data-explode"));
    if (!svg) return;
    var parts = svg.querySelectorAll("[data-ex]");
    function update() {
      var t = slider.value / 100;
      parts.forEach(function (p) {
        var d = p.getAttribute("data-ex").split(",");
        p.style.transform = "translate(" + parseFloat(d[0]) * t + "px," + parseFloat(d[1] || 0) * t + "px)";
      });
      /* fade part labels out as the assembly closes up */
      svg.querySelectorAll("text").forEach(function (tx) {
        tx.style.opacity = 0.15 + 0.85 * t;
      });
      var lbl = document.getElementById("explode-label");
      if (lbl) lbl.textContent = t < 0.15 ? "Assembled" : (t > 0.85 ? "Fully exploded" : "Drag to explode / assemble");
    }
    slider.addEventListener("input", update);
    update();
  });
})();

/* Quote form → Google Apps Script webhook (see GOOGLE-FORM-SETUP.md).
   If no endpoint is configured yet, fall back to a pre-filled email. */
(function () {
  "use strict";
  var form = document.getElementById("quote-form");
  if (!form) return;
  var endpoint = form.getAttribute("data-endpoint") || "";
  var status = document.getElementById("quote-status");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = new FormData(form);

    if (endpoint) {
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = "Sending…";
      fetch(endpoint, { method: "POST", mode: "no-cors", body: data })
        .then(function () {
          form.reset();
          status.textContent = "✓ Request sent — we'll get back to you within one business day.";
          status.style.color = "#8fbf7f";
        })
        .catch(function () {
          status.textContent = "Couldn't send right now — please email contact@tootagroup.com or call (848) 444-1195.";
          status.style.color = "#c8563e";
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = "Send Request";
        });
    } else {
      var body =
        "Name: " + (data.get("name") || "") +
        "\nOrganization: " + (data.get("organization") || "") +
        "\nEmail: " + (data.get("email") || "") +
        "\nPhone: " + (data.get("phone") || "") +
        "\nInterest: " + (data.get("interest") || "") +
        "\n\n" + (data.get("message") || "");
      window.location.href = "mailto:contact@tootagroup.com" +
        "?subject=" + encodeURIComponent("Quote Request — " + (data.get("name") || "Website")) +
        "&body=" + encodeURIComponent(body);
      status.textContent = "Opening your email app — or send directly to contact@tootagroup.com.";
    }
  });
})();

/* Vibrancy layer: headline entrance, stat count-up, hero parallax */
(function () {
  "use strict";
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* wrap hero headline words for staggered entrance */
  var h1 = document.querySelector(".hero h1");
  if (h1 && !reduced) {
    var delay = 0;
    Array.prototype.forEach.call(h1.childNodes, function (node) { void node; });
    h1.innerHTML = h1.innerHTML.split(/(<br\s*\/?>|<span[^>]*>[\s\S]*?<\/span>)/g).map(function (part) {
      if (!part) return "";
      if (part.indexOf("<") === 0) return part;
      return part.split(" ").map(function (w) {
        if (!w.trim()) return w;
        delay += 70;
        return '<span class="w" style="animation-delay:' + delay + 'ms">' + w + "</span>";
      }).join(" ");
    }).join("");
    /* the gold <span> rises as one unit */
    var goldSpan = h1.querySelector("span.gold");
    if (goldSpan) {
      goldSpan.classList.add("w");
      goldSpan.style.animationDelay = (delay + 140) + "ms";
    }
  }

  /* count-up stats when scrolled into view */
  var stats = document.querySelectorAll(".stat b");
  if (stats.length && "IntersectionObserver" in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        var node = e.target.childNodes[0];
        if (!node || node.nodeType !== 3) return;
        var target = parseInt(node.textContent, 10);
        if (!target) return;
        var t0 = null;
        function tick(ts) {
          if (!t0) t0 = ts;
          var p = Math.min((ts - t0) / 1100, 1);
          node.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.4 });
    stats.forEach(function (el) { io.observe(el); });
  }

  /* gentle parallax on the hero wheel */
  var art = document.querySelector(".hero-art");
  if (art && !reduced) {
    window.addEventListener("scroll", function () {
      var y = window.scrollY;
      if (y < 900) art.style.transform = "translateY(" + y * 0.1 + "px)";
    }, { passive: true });
  }
})();

(function () {
  "use strict";

  // ── Canvas setup ──────────────────────────────────────────────
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const liveEl = document.getElementById("livescore");

  // Logical canvas size (9:16)
  const CW = 360,
    CH = 640;
  canvas.width = CW;
  canvas.height = CH;

  // ── Game constants ────────────────────────────────────────────
  const GRAVITY = 0.45;
  const FLAP_VEL = -8.5;
  const PIPE_W = 60;
  const PIPE_GAP = 155;
  const PIPE_SPEED = 2.6;
  const PIPE_INTERVAL = 90; // frames between pipe spawns

  // ── Game state ────────────────────────────────────────────────
  let state = "start"; // 'start' | 'playing' | 'dead'
  let bird, pipes, score, hiScore, frameCount, animId;
  let bgOffset = 0,
    groundOffset = 0;
  let pipesPassed;
  let deathAnimTimer = 0;

  // ── High score (localStorage) ─────────────────────────────────
  function loadHi() {
    try {
      return parseInt(localStorage.getItem("fanafibird_hi") || "0", 10);
    } catch (e) {
      return 0;
    }
  }
  function saveHi(s) {
    try {
      localStorage.setItem("fanafibird_hi", s);
    } catch (e) {}
  }

  // ── Bird factory ──────────────────────────────────────────────
  function initBird() {
    return {
      x: CW * 0.28,
      y: CH * 0.45,
      vy: 0,
      w: 34,
      h: 26,
      angle: 0,
      flapFrame: 0,
      wingUp: false,
      dead: false,
    };
  }

  // ── Init / reset game state ───────────────────────────────────
  function initGame() {
    bird = initBird();
    pipes = [];
    score = 0;
    pipesPassed = new Set();
    frameCount = 0;
    hiScore = loadHi();
    deathAnimTimer = 0;
    liveEl.textContent = "0";
    liveEl.style.display = "block";
  }

  // ── Spawn a pipe pair ─────────────────────────────────────────
  function spawnPipe() {
    const minY = CH * 0.15;
    const maxY = CH * 0.7;
    const topH = minY + Math.random() * (maxY - minY);
    pipes.push({ x: CW + PIPE_W, topH, id: frameCount });
  }

  // ── Collision detection ───────────────────────────────────────
  function checkCollision() {
    const bx = bird.x - bird.w * 0.45;
    const by = bird.y - bird.h * 0.45;
    const bw = bird.w * 0.9;
    const bh = bird.h * 0.9;

    // Ground / ceiling
    if (bird.y + bird.h * 0.5 >= CH - 48) return true;
    if (bird.y - bird.h * 0.5 <= 0) return true;

    for (const p of pipes) {
      const topBot = p.topH;
      const botTop = p.topH + PIPE_GAP;
      if (bx < p.x + PIPE_W && bx + bw > p.x) {
        if (by < topBot || by + bh > botTop) return true;
      }
    }
    return false;
  }

  // ── Scoring ───────────────────────────────────────────────────
  function updateScore() {
    for (const p of pipes) {
      if (!pipesPassed.has(p.id) && p.x + PIPE_W < bird.x) {
        pipesPassed.add(p.id);
        score++;
        liveEl.textContent = score;
        // Pop animation
        liveEl.classList.remove("pop");
        void liveEl.offsetWidth; // force reflow
        liveEl.classList.add("pop");
        setTimeout(() => liveEl.classList.remove("pop"), 150);
      }
    }
  }

  // ── Draw: sky gradient ────────────────────────────────────────
  function drawSky() {
    const grad = ctx.createLinearGradient(0, 0, 0, CH - 80);
    grad.addColorStop(0, "#1a6bcc");
    grad.addColorStop(0.5, "#3a9bd5");
    grad.addColorStop(1, "#7ec8e3");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CW, CH - 80);
  }

  // ── Draw: scrolling clouds ────────────────────────────────────
  function drawClouds() {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    const clouds = [
      { bx: 40, by: 60, r: 22, ox: 0 },
      { bx: 130, by: 100, r: 18, ox: 0.4 },
      { bx: 240, by: 55, r: 25, ox: 0.7 },
      { bx: 310, by: 130, r: 16, ox: 0.2 },
    ];
    clouds.forEach((c) => {
      const x =
        ((((c.bx - bgOffset * (0.2 + c.ox * 0.1)) % (CW + 60)) + CW + 60) %
          (CW + 60)) -
        30;
      ctx.beginPath();
      ctx.ellipse(x, c.by, c.r * 1.6, c.r, 0, 0, Math.PI * 2);
      ctx.ellipse(x - c.r, c.by + 6, c.r * 0.9, c.r * 0.85, 0, 0, Math.PI * 2);
      ctx.ellipse(x + c.r, c.by + 8, c.r * 0.9, c.r * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // ── Draw: ground & scrolling grass ───────────────────────────
  function drawGround() {
    ctx.fillStyle = "#c8a96e";
    ctx.fillRect(0, CH - 48, CW, 48);

    ctx.fillStyle = "#5cb85c";
    ctx.fillRect(0, CH - 48, CW, 14);

    ctx.fillStyle = "#4a9e4a";
    for (let i = 0; i < 18; i++) {
      const gx = (((i * 22 - groundOffset) % (CW + 22)) + CW + 22) % (CW + 22);
      ctx.beginPath();
      ctx.moveTo(gx, CH - 48);
      ctx.lineTo(gx - 4, CH - 58);
      ctx.lineTo(gx + 4, CH - 58);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ── Draw: single pipe pair ────────────────────────────────────
  function drawPipe(p) {
    const bevel = 5;
    const botTop = p.topH + PIPE_GAP;

    // Top pipe body
    ctx.fillStyle = "#5dbf5d";
    ctx.fillRect(p.x, 0, PIPE_W, p.topH - 12);

    // Top pipe cap
    ctx.fillStyle = "#4aaa4a";
    ctx.beginPath();
    ctx.roundRect(p.x - 4, p.topH - 22, PIPE_W + 8, 22, [0, 0, bevel, bevel]);
    ctx.fill();

    // Top highlight
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(p.x + 4, 0, 8, p.topH - 12);

    // Bottom pipe body
    ctx.fillStyle = "#5dbf5d";
    ctx.fillRect(p.x, botTop + 12, PIPE_W, CH - botTop - 12 - 48);

    // Bottom pipe cap
    ctx.fillStyle = "#4aaa4a";
    ctx.beginPath();
    ctx.roundRect(p.x - 4, botTop, PIPE_W + 8, 22, [bevel, bevel, 0, 0]);
    ctx.fill();

    // Bottom highlight
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(p.x + 4, botTop + 12, 8, CH - botTop - 12 - 48);
  }

  // ── Draw: bird ────────────────────────────────────────────────
  function drawBird() {
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate((bird.angle * Math.PI) / 180);

    // Body
    ctx.fillStyle = bird.dead ? "#cc6600" : "#FFD700";
    ctx.beginPath();
    ctx.ellipse(0, 0, bird.w * 0.5, bird.h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Belly
    ctx.fillStyle = bird.dead ? "#ff8800" : "#FFF0A0";
    ctx.beginPath();
    ctx.ellipse(4, 4, bird.w * 0.3, bird.h * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wing
    const wingY = bird.wingUp ? -10 : 4;
    ctx.fillStyle = bird.dead ? "#aa5500" : "#FFC200";
    ctx.beginPath();
    ctx.ellipse(-2, wingY, bird.w * 0.28, bird.h * 0.22, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Eye (white)
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(10, -5, 6, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = bird.dead ? "#ff0000" : "#111";
    ctx.beginPath();
    ctx.ellipse(12, -5, 3, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye shine
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(13, -6.5, 1.2, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = "#FF6B00";
    ctx.beginPath();
    ctx.moveTo(14, -1);
    ctx.lineTo(22, 2);
    ctx.lineTo(14, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // ── Overlay: start screen ─────────────────────────────────────
  function showStart() {
    overlay.innerHTML = `
      <div class="title">🐦 FANAFI</div>
      <div class="subtitle">BIRD</div>
      <div class="best-display">BEST: ${loadHi()}</div>
      <button class="btn btn-start" id="startBtn">MULAI GAME</button>
      <div class="tap-hint">Tap layar atau klik untuk terbang</div>
    `;
    overlay.classList.remove("hidden");
    const btn = document.getElementById("startBtn");
    btn.addEventListener("click", beginGame);
    btn.addEventListener("touchend", (e) => {
      e.preventDefault();
      beginGame();
    });
  }

  // ── Overlay: game over screen ─────────────────────────────────
  function showGameOver() {
    const hi = Math.max(score, hiScore);
    saveHi(hi);
    const medal =
      score >= 30 ? "🥇" : score >= 20 ? "🥈" : score >= 10 ? "🥉" : "😵";
    overlay.innerHTML = `
      <div class="medal">${medal}</div>
      <div class="gameover-title">GAME OVER</div>
      <div class="score-display">${score}</div>
      <div class="best-display">🏆 BEST: ${hi}</div>
      <button class="btn btn-start" id="retryBtn">🔄 TRY AGAIN</button>
    `;
    overlay.classList.remove("hidden");
    const btn = document.getElementById("retryBtn");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      beginGame();
    });
    btn.addEventListener("touchend", (e) => {
      e.preventDefault();
      e.stopPropagation();
      beginGame();
    });
  }

  // ── Update logic ──────────────────────────────────────────────
  function update() {
    if (state === "start") {
      bgOffset += 0.5;
      groundOffset += 1;
      bird.y = CH * 0.45 + Math.sin(frameCount * 0.05) * 8; // idle float
      bird.angle = 0;
      frameCount++;
      return;
    }

    if (state === "dead") {
      deathAnimTimer++;
      bird.vy += GRAVITY * 1.5;
      bird.y += bird.vy;
      bird.angle = Math.min(bird.angle + 5, 90);
      if (deathAnimTimer === 40) showGameOver();
      return;
    }

    // state === 'playing'
    frameCount++;
    bgOffset += 0.8;
    groundOffset += PIPE_SPEED;

    // Physics
    bird.vy += GRAVITY;
    bird.y += bird.vy;
    bird.angle = Math.max(-25, Math.min(90, bird.vy * 4));

    // Wing animation
    bird.flapFrame++;
    if (bird.flapFrame % 8 === 0) bird.wingUp = !bird.wingUp;

    // Pipes
    if (frameCount % PIPE_INTERVAL === 0) spawnPipe();
    for (let i = pipes.length - 1; i >= 0; i--) {
      pipes[i].x -= PIPE_SPEED;
      if (pipes[i].x + PIPE_W < -10) pipes.splice(i, 1);
    }

    updateScore();

    if (checkCollision()) {
      bird.dead = true;
      bird.vy = -4;
      state = "dead";
    }
  }

  // ── Render ────────────────────────────────────────────────────
  function render() {
    ctx.clearRect(0, 0, CW, CH);
    drawSky();
    drawClouds();
    pipes.forEach(drawPipe);
    drawGround();
    drawBird();
  }

  // ── Game loop ─────────────────────────────────────────────────
  function gameLoop() {
    animId = requestAnimationFrame(gameLoop);
    update();
    render();
  }

  // ── Input: flap ───────────────────────────────────────────────
  function flap() {
    if (state === "playing") {
      bird.vy = FLAP_VEL;
      bird.wingUp = true;
    }
  }

  canvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      flap();
    },
    { passive: false },
  );

  canvas.addEventListener("mousedown", () => flap());

  document.addEventListener(
    "touchstart",
    (e) => {
      if (state === "start" && !e.target.closest("#overlay")) beginGame();
    },
    { passive: true },
  );

  document.addEventListener("keydown", (e) => {
    if ((e.code === "Space" || e.code === "ArrowUp") && state === "playing") {
      e.preventDefault();
      flap();
    }
  });

  // ── Start / restart game ──────────────────────────────────────
  function beginGame() {
    overlay.classList.add("hidden");
    cancelAnimationFrame(animId);
    initGame();
    state = "playing";
    frameCount = 0;
    liveEl.style.display = "block";
    liveEl.textContent = "0";
    gameLoop();
  }

  // ── Boot ──────────────────────────────────────────────────────
  function boot() {
    initGame();
    state = "start";
    showStart();
    liveEl.style.display = "none";
    gameLoop();
  }

  boot();
})();

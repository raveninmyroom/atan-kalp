
const canvas = document.getElementById("heartCanvas");
const ctx = canvas.getContext("2d");

const button = document.getElementById("toggleButton");
const stars = document.getElementById("stars");

const WIDTH = 420;
const HEIGHT = 510;

const BPM = 72;
const MOTION = 1.0;

// Küçüldükçe daha fazla rakam kullanılır
const STEP_X = 5;
const STEP_Y = 7;

const DIGITS = "0123456789";

let particles = [];
let running = true;
let lastTime = performance.now();
let elapsed = 0;
let imageReady = false;

// ------------------------------
// CANVAS
// ------------------------------

function setupCanvas() {
  const dpr = Math.min(
    window.devicePixelRatio || 1,
    2
  );

  canvas.width = Math.round(WIDTH * dpr);
  canvas.height = Math.round(HEIGHT * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
}

// ------------------------------
// MATEMATİKSEL YARDIMCILAR
// ------------------------------

function gaussian(x, y, cx, cy, sx, sy) {
  const dx = (x - cx) / sx;
  const dy = (y - cy) / sy;

  return Math.exp(
    -0.5 * (dx * dx + dy * dy)
  );
}

function pulse(phase, center, width) {
  let d = phase - center;

  d = ((d + 0.5 + 1) % 1) - 0.5;

  return Math.exp(
    -0.5 * Math.pow(d / width, 2)
  );
}

function smoothstep(a, b, value) {
  let t = (value - a) / (b - a);

  t = Math.max(0, Math.min(1, t));

  return t * t * (3 - 2 * t);
}

// ------------------------------
// FOTOĞRAFI RAKAMLARA DÖNÜŞTÜR
// ------------------------------

function loadHeart() {
  const img = new Image();

  img.onload = () => {
    const offscreen = document.createElement("canvas");

    offscreen.width = WIDTH;
    offscreen.height = HEIGHT;

    const offctx = offscreen.getContext(
      "2d", { willReadFrequently: true }
    );

    // Kalbin orijinal oranlarını koru
    const scale = Math.min(
      (WIDTH - 28) / img.width,
      (HEIGHT - 28) / img.height
    );

    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;

    const ox = (WIDTH - drawWidth) / 2;
    const oy = (HEIGHT - drawHeight) / 2;

    offctx.drawImage(
      img, ox, oy, drawWidth, drawHeight
    );

    const data = offctx.getImageData(
      0, 0, WIDTH, HEIGHT
    ).data;

    particles = [];

    for (let y = 0; y < HEIGHT; y += STEP_Y) {
      for (let x = 0; x < WIDTH; x += STEP_X) {

        const index = (y * WIDTH + x) * 4;

        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const a = data[index + 3];

        if (a < 110) continue;

        const nx = x / WIDTH;
        const ny = y / HEIGHT;

        const left = gaussian(
          nx, ny, 0.37, 0.67, 0.24, 0.23
        );

        const right = gaussian(
          nx, ny, 0.72, 0.63, 0.22, 0.23
        );

        const apex = gaussian(
          nx, ny, 0.51, 0.89, 0.24, 0.14
        );

        const upper = gaussian(
          nx, ny, 0.49, 0.40, 0.34, 0.17
        );

        const vessels = gaussian(
          nx, ny, 0.51, 0.12, 0.42, 0.18
        );

        const bodyMask = smoothstep(
          0.24, 0.62, ny
        );

        const digit = DIGITS[
          ((x / STEP_X) * 7 +
           (y / STEP_Y) * 3) % 10
        ];

        const red = Math.min(
          255, Math.round(r * 1.12 + 12)
        );

        const green = Math.round(g * 0.95);
        const blue = Math.round(b * 0.95);

        particles.push({
          x, y, nx, ny,
          left, right,
          apex, upper,
          vessels, bodyMask,
          digit,
          color: `rgba(${red},${green},${blue},${a / 255})`
        });
      }
    }

    imageReady = true;
    render(0);
  };

  img.onerror = () => {
    console.error(
      "kalp.png yüklenemedi. Dosya adını kontrol et."
    );
  };

  img.src = "kalp.png";
}

// ------------------------------
// ANATOMİK HAREKET
// ------------------------------

function getMovement(p, phase) {
  const systole = pulse(
    phase, 0.27, 0.105
  );

  const relaxation = pulse(
    phase, 0.53, 0.15
  );

  const atrial = pulse(
    phase, 0.90, 0.07
  );

  const contraction =
    p.left * 0.80 +
    p.right * 0.95;

  let dx =
    -(p.nx - 0.53) *
    contraction *
    systole *
    0.070 * WIDTH;

  let dy =
    -(p.ny - 0.45) *
    contraction *
    systole *
    0.050 * HEIGHT;

  // Kalbin sivri ucu yukarı çekilir
  dy -=
    p.apex *
    systole *
    0.030 * HEIGHT;

  // Kalp ucu hafif yana kayar
  dx +=
    p.apex *
    systole *
    0.018 * WIDTH;

  // Hafif burulma
  const twist =
    0.025 * systole * p.bodyMask;

  dx +=
    -(p.ny - 0.53) *
    twist * WIDTH;

  dy +=
    (p.nx - 0.52) *
    twist * HEIGHT;

  // Üst odacıkların hareketi
  dx +=
    -(p.nx - 0.50) *
    p.upper *
    atrial *
    0.016 * WIDTH;

  dy +=
    p.upper *
    systole *
    0.007 * HEIGHT;

  // Gevşeme
  dx +=
    (p.nx - 0.53) *
    contraction *
    relaxation *
    0.009 * WIDTH;

  // Damarlar daha az hareket eder
  dx +=
    p.vessels *
    systole *
    0.004 * WIDTH;

  dy -=
    p.vessels *
    systole *
    0.003 * HEIGHT;

  return {
    x: p.x + dx * MOTION,
    y: p.y + dy * MOTION
  };
}

// ------------------------------
// ÇİZİM
// ------------------------------

function render(phase) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  if (!imageReady) return;

  ctx.font = "bold 10px Consolas, monospace";

  for (const p of particles) {
    const pos = getMovement(p, phase);

    ctx.fillStyle = p.color;

    ctx.fillText(
      p.digit,
      pos.x,
      pos.y
    );
  }
}

// ------------------------------
// ANİMASYON
// ------------------------------

function animate(now) {
  const dt = Math.min(
    (now - lastTime) / 1000,
    0.1
  );

  lastTime = now;

  if (running) {
    elapsed += dt;

    const phase = (
      elapsed * BPM / 60
    ) % 1;

    render(phase);
  }

  requestAnimationFrame(animate);
}

// ------------------------------
// DURDUR / DEVAM ETTİR
// ------------------------------

button.addEventListener("click", () => {
  running = !running;

  button.textContent = running
    ? "Kalbi durdur"
    : "Kalbi yeniden başlat";
});

// ------------------------------
// YILDIZLAR
// ------------------------------

function createStars() {
  for (let i = 0; i < 45; i++) {
    const star = document.createElement("span");

    star.className = "star";

    star.style.left = Math.random() * 100 + "%";
    star.style.top = Math.random() * 100 + "%";

    star.style.animationDelay =
      Math.random() * 4 + "s";

    stars.appendChild(star);
  }
}

// ------------------------------
// BAŞLAT
// ------------------------------

setupCanvas();
createStars();
loadHeart();

requestAnimationFrame(animate);

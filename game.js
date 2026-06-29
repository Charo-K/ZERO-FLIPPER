// ═══════════════════════════════════════════════
//  FLIPPER  ·  game.js
//  Canvas 720 × 586  —  pinball architecture
// ═══════════════════════════════════════════════

const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const W = 720, H = 586;
canvas.width = W; canvas.height = H;

const DEG = Math.PI / 180;

// ── Offscreen canvases ─────────────────────────
const glowCanvas  = document.createElement('canvas');
glowCanvas.width  = W; glowCanvas.height = H;
const glowCtx     = glowCanvas.getContext('2d');

const noiseCanvas = document.createElement('canvas');
noiseCanvas.width  = 180; noiseCanvas.height = 147;
const noiseCtx    = noiseCanvas.getContext('2d');

// ── Organic screen clip ────────────────────────
const organicClipPath = new Path2D(
    'M191.477 296.741 ' +
    'C236.688 298.53 324.729 291.385 340.195 289.606 ' +
    'C355.661 287.817 361.017 275.326 363.991 260.453 ' +
    'C366.966 245.581 371.729 171.819 371.127 148.023 ' +
    'C370.534 124.226 370.339 89.6396 368.152 68.9052 ' +
    'C365.77 46.3044 363.389 26.0754 356.847 16.5588 ' +
    'C351.52 8.8113 330.076 7.04214 330.076 7.04214 ' +
    'C290.813 1.09302 191.467 0.500008 191.467 0.500008 ' +
    'H180.21 ' +
    'C180.21 0.500008 80.8637 1.09302 41.6015 7.04214 ' +
    'C41.6015 7.04214 20.1574 8.8113 14.8304 16.5588 ' +
    'C8.28833 26.0754 5.90674 46.3044 3.52515 68.9052 ' +
    'C1.33797 89.6494 1.14355 124.226 0.550582 148.023 ' +
    'C-0.0423866 171.819 4.71108 245.581 7.68564 260.453 ' +
    'C10.6602 275.326 16.0164 287.817 31.4821 289.606 ' +
    'C46.9479 291.395 134.989 298.53 180.2 296.741 ' +
    'H191.457 H191.477 Z'
);

// ── Theme ──────────────────────────────────────
const T = {
    bg        : '#050C01',
    accent    : '#81F416',
    white     : '#B9EC6C',
    dim       : 'rgba(129,244,22,0.38)',
    dimmer    : 'rgba(129,244,22,0.12)',
    overlay   : 'rgba(3,9,0,0.84)',
    scoreHigh : '#81F416',
    scoreLow  : 'rgba(129,244,22,0.38)',
    label     : 'rgba(129,244,22,0.22)',
    btnBg     : '#0A1602',
    btnBorder : 'rgba(129,244,22,0.28)',
};

// ── Assets ─────────────────────────────────────
const smileyImg  = new Image(); smileyImg.src  = 'assets/smiley.svg';
const sadfaceImg = new Image(); sadfaceImg.src = 'assets/sadface.svg';
const cursorImg  = new Image(); cursorImg.src  = 'assets/cursor.svg';

// ── Audio ──────────────────────────────────────
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function resumeAudio() { if (audioCtx.state === 'suspended') audioCtx.resume(); }

const settings = { sound: true };

function beep(freq, dur, type = 'square', vol = 0.13) {
    if (!settings.sound) return;
    try {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.type = type;
        o.frequency.setValueAtTime(freq, audioCtx.currentTime);
        g.gain.setValueAtTime(vol, audioCtx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        o.start(); o.stop(audioCtx.currentTime + dur);
    } catch (_) {}
}

const SFX = {
    flipper : () => beep(440, 0.05, 'square', 0.12),
    bumper  : () => { beep(620, 0.06, 'square', 0.15); setTimeout(() => beep(720, 0.04, 'square', 0.10), 35); },
    sling   : () => { beep(500, 0.05, 'square', 0.14); setTimeout(() => beep(380, 0.07, 'square', 0.10), 40); },
    wall    : () => beep(280, 0.04, 'square', 0.07),
    drain   : () => { beep(220, 0.15, 'sine', 0.12); setTimeout(() => beep(160, 0.28, 'sine', 0.10), 170); },
    launch  : () => { beep(200, 0.06, 'square', 0.10); setTimeout(() => beep(350, 0.12, 'square', 0.14), 60); },
};

// ── Table Architecture ─────────────────────────
//
//  Top wall:   bezier curve from (82,145) over peak (360,40) to (678,176)
//  Left wall:  x=82, y=145..445  (gap at sling zone 263..397)
//  Right wall: x=634, y=270..445 (gap at sling zone 263..397)
//  Kickers:    left  (82,445)→(329,552)
//              right (634,445)→(393,552)
//  Plunger:    x=634..678, exit cap at y=270

const TL = 77, TR = 630;
const PR = 672;
const PLUNGER_EXIT_Y = 270;

// Approximate arch for physics — circle fitted through (360,54) top-center and (42,127)/(677,127) corners
const ARCH_CX = 360, ARCH_CY = 783, ARCH_R = 729;

// Sling zone boundaries
const SLING_TOP = 273, SLING_BOT = 466, KICKER_Y = 510;
const PLUNGER_FLOOR_Y = 490;

// Straight wall segments (sides + kickers + plunger)
const WALLS = [
    [TL,  100,  TL,  KICKER_Y],                     // left wall
    [TL,  KICKER_Y, 280, 535],                        // left kicker slope
    [TR,  100, TR,  KICKER_Y],                        // right main wall
    [607, 431,  TR,  KICKER_Y],                       // closes right sling pocket → kicker
    [TR,  400, TR, PLUNGER_FLOOR_Y],                  // right inner wall
    [PR,  KICKER_Y, 440, 535],                        // right kicker slope
    [TR,  PLUNGER_EXIT_Y, PR, PLUNGER_EXIT_Y],        // plunger cap
    [PR,  PLUNGER_EXIT_Y, PR, H+20],                  // plunger right wall
];

// ── Bumpers ─────────────────────────────────────
const BUMPER_DEFS = [
    { x:361, y:153, r:34, pts:100 },   // top
    { x:217, y:230, r:34, pts: 50 },   // left
    { x:504, y:232, r:34, pts: 50 },   // right
    { x:361, y:343, r:34, pts: 25 },   // center-bottom
    { x:259, y:313, r: 9, pts: 10 },   // small left
    { x:460, y:313, r: 9, pts: 10 },   // small right
];
const BUMPER_MIN_SPD = 6;
let bumpers = [];

// ── Slingshot triangles ────────────────────────
// v[0]=wall-top, v[1]=wall-bottom, v[2]=inner tip
const SLING_DEFS = [
    { verts: [{x:111,y:298},{x:111,y:431},{x:228,y:462}], pts: 80 },
    { verts: [{x:607,y:298},{x:607,y:431},{x:490,y:462}], pts: 80 },
];
let slings = [];

// Exact arch dot positions from SVG (scaled to game space 720×586, xs=1.9355, ys=1.9664)
// Left 14 dots (down left wall then across top), Right 16 dots (mirrored + extra for plunger side)
const TOP_ARCH_DOTS = [
    [42,127],[42,156],[49,101],[67,80],[88,64],[115,56],
    [142,54],[169,54],[197,54],[224,54],[251,54],[278,54],[305,54],[332,54],
    [677,127],[677,156],[677,182],[669,101],[651,80],[630,64],[603,56],
    [576,54],[549,54],[522,54],[495,54],[468,54],[441,54],[413,54],[386,54],[359,54],
];

// ── Flippers ────────────────────────────────────
const FL_LEN   = 115; // matches visual: (215,510)→(329,527) = sqrt(114²+17²) ≈ 115.3
const FL_SPEED = 18 * DEG;
const FL_THICK = 14;

const flippers = [
    { pivot:{x:215,y:498}, len:FL_LEN, restAngle:  8.5*DEG, upAngle: -39.5*DEG, angle:  8.5*DEG, angularVel:0, active:false },
    { pivot:{x:504,y:498}, len:FL_LEN, restAngle:171.5*DEG, upAngle: 219.5*DEG, angle:171.5*DEG, angularVel:0, active:false },
];

function flipperTip(f) {
    return { x: f.pivot.x + Math.cos(f.angle)*f.len, y: f.pivot.y + Math.sin(f.angle)*f.len };
}

// ── Ball ───────────────────────────────────────
const BALL_R  = 15;
const GRAVITY = 0.18;
const MAX_SPD = 14;

const ball = { x:651, y:420, vx:0, vy:0, angle:0, inLane:true };

// ── Plunger ─────────────────────────────────────
const plunger = { charge:0, charging:false, CHARGE_SPD:0.02, MIN_V:8, MAX_V:16 };


// ── Game state ─────────────────────────────────
let gameState = 'menu';
let prevGameState = 'playing';
let score     = 0;
let scoreDisp = 0;
let hiScore   = parseInt(localStorage.getItem('flipper_hi') || '0');
let lives     = 3;
let combo     = 0;
let comboTimer= 0;

// ── Leaderboard ────────────────────────────────
let playerName  = '';
let cursorBlink = 0;
let leaderboard = JSON.parse(localStorage.getItem('zeroflipper_lb') || '[]');

// ── Button registry (for clickable UI) ─────────
let buttons = [];
function reg(x, y, w, h, action) { buttons.push({x, y, w, h, action}); }
function rBtn(x, y, w, h) {
    ctx.fillStyle = T.btnBg;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 3); ctx.fill();
    ctx.strokeStyle = T.btnBorder; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 3); ctx.stroke();
}

// ── Mouse / cursor ─────────────────────────────
let mouseX = W/2, mouseY = H/2;
let cRect  = canvas.getBoundingClientRect();
window.addEventListener('resize', () => { cRect = canvas.getBoundingClientRect(); });
canvas.addEventListener('mousemove', e => {
    cRect  = canvas.getBoundingClientRect();
    mouseX = (e.clientX - cRect.left) * (W / cRect.width);
    mouseY = (e.clientY - cRect.top)  * (H / cRect.height);
});
canvas.addEventListener('click', e => {
    resumeAudio();
    cRect = canvas.getBoundingClientRect();
    const cx = (e.clientX - cRect.left) * (W / cRect.width);
    const cy = (e.clientY - cRect.top)  * (H / cRect.height);
    for (const b of buttons) {
        if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) {
            b.action(); return;
        }
    }
});
function drawCursor() { ctx.drawImage(cursorImg, mouseX, mouseY, 29, 46); }

// ── Input ──────────────────────────────────────
const keys = {};

document.addEventListener('keydown', e => {
    if (['Space','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    resumeAudio();
    if (gameState === 'leaderboard') {
        if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') gameState = 'menu';
        return;
    }
    if (gameState === 'menu') {
        if (e.code === 'Backspace') { playerName = playerName.slice(0, -1); e.preventDefault(); return; }
        if (e.code === 'Escape')    { playerName = ''; return; }
        if (e.code === 'Space' || e.code === 'Enter') { startGame(); return; }
        if (e.key.length === 1 && playerName.length < 12) { playerName += e.key.toUpperCase(); return; }
        return;
    }
    if (gameState === 'gameover') {
        if (e.code === 'Space' || e.code === 'Enter') startGame();
        return;
    }
    if (e.code === 'Escape') {
        if (gameState === 'ingame-menu') { gameState = prevGameState; return; }
        if (gameState === 'playing') gameState = 'paused';
        else if (gameState === 'paused') gameState = 'playing';
    }
    if (e.code === 'KeyP') {
        if (gameState === 'playing') gameState = 'paused';
        else if (gameState === 'paused') gameState = 'playing';
    }
    if (e.code === 'Space') {
        if (gameState === 'playing') { gameState = 'paused'; return; }
        if (gameState === 'paused')  { gameState = 'playing'; return; }
    }
    if (gameState === 'paused' || gameState === 'ingame-menu') return;
    if (e.code === 'ArrowLeft')  { flippers[0].active = true;  SFX.flipper(); }
    if (e.code === 'ArrowRight') { flippers[1].active = true;  SFX.flipper(); }
});

document.addEventListener('keyup', e => {
    keys[e.code] = false;
    if (e.code === 'ArrowLeft')  flippers[0].active = false;
    if (e.code === 'ArrowRight') flippers[1].active = false;
    if (e.code === 'Space' && gameState === 'ready' && plunger.charge > 0) launchBall();
});

// ── Game functions ─────────────────────────────
function startGame() {
    score = 0; scoreDisp = 0; lives = 3; combo = 0; comboTimer = 0;
    bumpers = BUMPER_DEFS.map(b => ({ ...b, flash:0 }));
    slings  = SLING_DEFS.map(s => ({ ...s, flash:0 }));
    resetBall();
}

function resetBall() {
    ball.x = 651; ball.y = 420;
    ball.vx = 0;  ball.vy = 0;
    ball.inLane = true;
    plunger.charge = 0; plunger.charging = false;
    resetAntiStuck();
    gameState = 'ready';
}

function launchBall() {
    ball.vy = -(plunger.MIN_V + plunger.charge * (plunger.MAX_V - plunger.MIN_V));
    ball.vx = 0;
    plunger.charge = 0; plunger.charging = false;
    gameState = 'playing';
    SFX.launch();
}

function saveToLeaderboard() {
    const name = playerName.trim();
    if (!name) return;
    leaderboard.push({ name, score });
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, 20);
    localStorage.setItem('zeroflipper_lb', JSON.stringify(leaderboard));
}

function onDrain() {
    SFX.drain(); lives--; combo = 0; comboTimer = 0;
    if (lives <= 0) {
        if (score > hiScore) { hiScore = score; localStorage.setItem('flipper_hi', hiScore); }
        saveToLeaderboard();
        gameState = 'gameover';
    } else { resetBall(); }
}

// ── Math helpers ───────────────────────────────
function closestPtOnSeg(px, py, ax, ay, bx, by) {
    const dx=bx-ax, dy=by-ay, len2=dx*dx+dy*dy;
    if (len2===0) return {x:ax,y:ay};
    const t = Math.max(0, Math.min(1, ((px-ax)*dx+(py-ay)*dy)/len2));
    return {x:ax+t*dx, y:ay+t*dy};
}
function clampSpeed() {
    const s = Math.hypot(ball.vx, ball.vy);
    if (s > MAX_SPD) { ball.vx=ball.vx/s*MAX_SPD; ball.vy=ball.vy/s*MAX_SPD; }
}

// ── Physics ─────────────────────────────────────
function updateFlippers() {
    for (const f of flippers) {
        const target = f.active ? f.upAngle : f.restAngle;
        let diff = target - f.angle;
        while (diff >  Math.PI) diff -= 2*Math.PI;
        while (diff < -Math.PI) diff += 2*Math.PI;
        const step = Math.sign(diff) * Math.min(Math.abs(diff), FL_SPEED);
        f.angularVel = step; f.angle += step;
    }
}

function resolveArch() {
    const dx=ball.x-ARCH_CX, dy=ball.y-ARCH_CY;
    const dist = Math.hypot(dx, dy);
    // Large-radius circle approximating the bezier top wall — only relevant near the top
    if (dist > ARCH_R - BALL_R) {
        const nx=dx/dist, ny=dy/dist;
        ball.x = ARCH_CX + nx*(ARCH_R - BALL_R - 0.5);
        ball.y = ARCH_CY + ny*(ARCH_R - BALL_R - 0.5);
        const dot = ball.vx*nx + ball.vy*ny;
        if (dot > 0) { ball.vx -= 1.7*dot*nx; ball.vy -= 1.7*dot*ny; SFX.wall(); }
    }
}

function resolveWallSeg(ax, ay, bx, by) {
    const cp = closestPtOnSeg(ball.x, ball.y, ax, ay, bx, by);
    const dx=ball.x-cp.x, dy=ball.y-cp.y;
    const dist = Math.hypot(dx, dy);
    if (dist < BALL_R && dist > 0) {
        const nx=dx/dist, ny=dy/dist;
        ball.x = cp.x + nx*(BALL_R+0.5);
        ball.y = cp.y + ny*(BALL_R+0.5);
        const dot = ball.vx*nx + ball.vy*ny;
        if (dot < 0) { ball.vx -= 1.7*dot*nx; ball.vy -= 1.7*dot*ny; SFX.wall(); }
    }
}

function resolveBumpers() {
    for (const b of bumpers) {
        if (b.flash > 0) b.flash--;
        const dx=ball.x-b.x, dy=ball.y-b.y;
        const dist = Math.hypot(dx, dy);
        if (dist < BALL_R+b.r && dist > 0) {
            const nx=dx/dist, ny=dy/dist;
            const spd = Math.max(Math.hypot(ball.vx, ball.vy), BUMPER_MIN_SPD) * 1.15;
            ball.vx = nx*spd; ball.vy = ny*spd;
            ball.x  = b.x + nx*(BALL_R+b.r+1);
            ball.y  = b.y + ny*(BALL_R+b.r+1);
            combo++; comboTimer = 180;
            score += b.pts * (combo >= 3 ? 2 : 1);
            b.flash = 14; SFX.bumper();
        }
    }
    if (comboTimer > 0) comboTimer--; else combo = 0;
}

function resolveSlings() {
    for (const s of slings) {
        if (s.flash > 0) s.flash--;
        const v = s.verts;
        // Check all 3 sides of the triangle
        const sides = [
            [v[0].x,v[0].y, v[1].x,v[1].y],
            [v[1].x,v[1].y, v[2].x,v[2].y],
            [v[2].x,v[2].y, v[0].x,v[0].y],
        ];
        for (const [ax,ay,bx,by] of sides) {
            const cp = closestPtOnSeg(ball.x, ball.y, ax, ay, bx, by);
            const dx=ball.x-cp.x, dy=ball.y-cp.y;
            const dist = Math.hypot(dx, dy);
            if (dist < BALL_R && dist > 0) {
                const nx=dx/dist, ny=dy/dist;
                // Vertical back faces are one-sided: only deflect from the field side.
                // Left sling (ax=111 < 360): skip if ball is in pocket (nx<0, to the left).
                // Right sling (ax=607 > 360): skip if ball is in pocket (nx>0, to the right).
                if (ax===bx && ((ax<360 && nx<0)||(ax>360 && nx>0))) continue;
                ball.x = cp.x + nx*(BALL_R+1);
                ball.y = cp.y + ny*(BALL_R+1);
                const dot = ball.vx*nx + ball.vy*ny;
                if (dot < 0) {
                    // Strong kick away from sling
                    const spd = Math.max(Math.hypot(ball.vx, ball.vy), 7);
                    ball.vx = nx*spd*1.3;
                    ball.vy = ny*spd*1.3;
                    score += s.pts;
                    s.flash = 12; SFX.sling();
                }
                break;
            }
        }
    }
}

function resolveFlippers() {
    for (const f of flippers) {
        const tip = flipperTip(f);

        // t_norm: 0=pivot, 1=tip. Ball past 92% of the flipper is near/past the tip —
        // release it so gravity pulls it off the end and it can drain between the flippers.
        const sdx = tip.x - f.pivot.x, sdy = tip.y - f.pivot.y;
        const t_norm = ((ball.x - f.pivot.x)*sdx + (ball.y - f.pivot.y)*sdy) / (f.len * f.len);
        if (t_norm > 0.92) continue;

        const cp  = closestPtOnSeg(ball.x, ball.y, f.pivot.x, f.pivot.y, tip.x, tip.y);
        const dx=ball.x-cp.x, dy=ball.y-cp.y;
        const dist = Math.hypot(dx, dy);
        if (dist < BALL_R+FL_THICK && dist > 0) {
            const nx=dx/dist, ny=dy/dist;
            // Only collide from above (ny<0 = ball above the physics line).
            // ny>=0 means ball is below the flipper surface — let it fall to the drain.
            if (ny >= 0) continue;

            ball.x = cp.x + nx*(BALL_R+FL_THICK+1);
            ball.y = cp.y + ny*(BALL_R+FL_THICK+1);

            // Surface velocity of the flipper at the contact point (v = ω × r)
            const svx = -f.angularVel * (cp.y - f.pivot.y);
            const svy =  f.angularVel * (cp.x - f.pivot.x);

            // Relative velocity: ball approaching a moving surface
            const dot = (ball.vx - svx)*nx + (ball.vy - svy)*ny;
            if (dot < 0) {
                const e = f.active ? 1.5 : 0.3;
                ball.vx -= (1+e)*dot*nx;
                ball.vy -= (1+e)*dot*ny;
                if (f.active) SFX.flipper();
            }
        }
    }
}

// One-way barrier: seals the channel between right sling and right wall after launch.
// Allows passage from the plunger zone toward the field, blocks the reverse.
// ── Anti-stuck: multi-period loop detection + bounding-box confinement ────────
// Ring buffer of 120 frames. Four lookback windows catch loops of any period.
// Bounding-box check catches confinement even when loop period doesn't align
// with the fixed windows (e.g. tight oscillation against a sling face).
const ANTI_N = 120;
const _ahx = new Float32Array(ANTI_N);
const _ahy = new Float32Array(ANTI_N);
let   _aidx = 0, _aSlowFrames = 0, _aNudgeCount = 0;

function resetAntiStuck() {
    _aidx = 0; _aSlowFrames = 0;
}

function resolveAntiStuck() {
    if (ball.inLane) return;

    _ahx[_aidx % ANTI_N] = ball.x;
    _ahy[_aidx % ANTI_N] = ball.y;
    const cur = _aidx;
    _aidx++;

    function nudge() {
        const spd = Math.max(Math.hypot(ball.vx, ball.vy), 7);
        // Alternate CW/CCW 90° rotation + downward bias to clear surface traps
        const dir = (_aNudgeCount & 1) ? 1 : -1;
        _aNudgeCount++;
        const nvx = -dir * ball.vy;
        const nvy =  dir * ball.vx + 3;
        const ns  = Math.hypot(nvx, nvy);
        ball.vx = nvx / ns * spd;
        ball.vy = nvy / ns * spd;
        _aidx = 0; _aSlowFrames = 0;
    }

    // Multi-period loop checks: 20f (~0.33s), 40f (~0.67s), 70f (~1.17s), 110f (~1.83s)
    for (const lb of [20, 40, 70, 110]) {
        if (cur >= lb) {
            const iOld = (cur - lb + ANTI_N) % ANTI_N;
            if (Math.hypot(ball.x - _ahx[iOld], ball.y - _ahy[iOld]) < 22) { nudge(); return; }
        }
    }

    // Bounding-box confinement: every 30 frames check if ball stayed in ≤55×55px
    // region over the past 90 frames — catches oscillations that skip the period checks
    if (cur % 30 === 0 && cur >= 90) {
        let minX = ball.x, maxX = ball.x, minY = ball.y, maxY = ball.y;
        for (const offset of [30, 60, 90]) {
            const ii = (cur - offset + ANTI_N) % ANTI_N;
            if (_ahx[ii] < minX) minX = _ahx[ii]; if (_ahx[ii] > maxX) maxX = _ahx[ii];
            if (_ahy[ii] < minY) minY = _ahy[ii]; if (_ahy[ii] > maxY) maxY = _ahy[ii];
        }
        if ((maxX - minX) < 55 && (maxY - minY) < 55) { nudge(); return; }
    }

    // Slow-ball floor: speed < 1.5 for 90 frames → kick toward center+down
    const spd = Math.hypot(ball.vx, ball.vy);
    if (spd < 1.5) {
        _aSlowFrames++;
        if (_aSlowFrames > 90) {
            ball.vx = ball.x < W / 2 ? 5 : -5;
            ball.vy = 5;
            _aSlowFrames = 0; _aidx = 0;
        }
    } else {
        _aSlowFrames = 0;
    }
}

function resolveReturnBarrier() {
    if (ball.inLane) return;
    const cp = closestPtOnSeg(ball.x, ball.y, 607, 431, TR, PLUNGER_EXIT_Y);
    const dx=ball.x-cp.x, dy=ball.y-cp.y;
    const dist = Math.hypot(dx, dy);
    if (dist < BALL_R && dist > 0) {
        const nx=dx/dist, ny=dy/dist;
        if (nx > 0) return; // plunger-zone side — let it through
        ball.x = cp.x + nx*(BALL_R+0.5);
        ball.y = cp.y + ny*(BALL_R+0.5);
        const dot = ball.vx*nx + ball.vy*ny;
        if (dot < 0) { ball.vx -= 1.7*dot*nx; ball.vy -= 1.7*dot*ny; }
    }
}

function update() {
    updateFlippers();
    if (gameState === 'ready') {
        if (keys['Space']) plunger.charge = Math.min(1, plunger.charge + plunger.CHARGE_SPD);
        return;
    }
    if (gameState !== 'playing') return;

    ball.vy += GRAVITY;
    ball.x  += ball.vx;
    ball.y  += ball.vy;
    ball.angle += ball.vx * 0.055;

    if (ball.inLane) {
        if (ball.x < TR+BALL_R) { ball.x = TR+BALL_R; if (ball.vx<0) ball.vx*=-0.8; }
        if (ball.x > PR-BALL_R) { ball.x = PR-BALL_R; if (ball.vx>0) ball.vx*=-0.8; }

        // Spring floor: ball didn't make it out — catch and reset
        if (ball.y + BALL_R >= PLUNGER_FLOOR_Y) {
            ball.y  = PLUNGER_FLOOR_Y - BALL_R;
            ball.vy = 0; ball.vx = 0;
            plunger.charge = 0;
            gameState = 'ready';
        }
        if (ball.y < PLUNGER_EXIT_Y + BALL_R) {
            ball.inLane = false;
        }
    } else {
        resolveArch();
        for (const [ax,ay,bx,by] of WALLS.slice(0,6)) resolveWallSeg(ax,ay,bx,by);
        // Right boundary: one-way wall — blocks ball from entering plunger zone, not from exiting
        if (ball.x + BALL_R > TR && ball.vx > 0) {
            ball.x = TR - BALL_R - 0.5;
            ball.vx *= -0.8;
        }
        resolveBumpers();
        resolveSlings();
        resolveFlippers();
        resolveReturnBarrier();
        resolveAntiStuck();
        if (ball.y > H + BALL_R*2) onDrain();
    }
    clampSpeed();
}

// ── Drawing ─────────────────────────────────────

function drawField() {
    ctx.setLineDash([]);
    ctx.strokeStyle = T.accent;
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';

    // ── Inner plunger lane divider ──────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(TR, 400);
    ctx.lineTo(TR, PLUNGER_FLOOR_Y);
    ctx.stroke();

    // ── Arch dots — exact SVG circle positions, scaled to game space ─
    ctx.lineWidth = 1;
    for (const [adx, ady] of TOP_ARCH_DOTS) {
        const ag = ctx.createRadialGradient(adx, ady, 0, adx, ady, 5);
        ag.addColorStop(0, '#2A5800'); ag.addColorStop(1, '#060D02');
        ctx.beginPath(); ctx.arc(adx, ady, 5, 0, Math.PI*2);
        ctx.fillStyle = ag; ctx.fill();
        ctx.strokeStyle = T.accent; ctx.stroke();
    }

    // ── Left corner sling (Group 1637) — exact SVG bezier, scaled ─
    {
        const cg = ctx.createLinearGradient(0, 182, 0, 268);
        cg.addColorStop(0, '#060D02'); cg.addColorStop(1, '#2A5800');
        ctx.beginPath();
        ctx.moveTo(42, 246); ctx.lineTo(42, 189);
        ctx.bezierCurveTo(42, 182, 51, 179, 56, 185);
        ctx.lineTo(106, 258);
        ctx.bezierCurveTo(109, 263, 105, 268, 100, 268);
        ctx.lineTo(53, 260);
        ctx.bezierCurveTo(46, 259, 42, 253, 42, 246);
        ctx.closePath();
        ctx.fillStyle = cg; ctx.fill();
        ctx.strokeStyle = T.accent; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
        for (const [dx,dy] of [[51,195],[53,247],[94,258]]) {
            ctx.beginPath(); ctx.arc(dx, dy, 3, 0, Math.PI*2);
            ctx.fillStyle = T.accent; ctx.fill();
        }
    }

    // ── Main slingshots (Group 1634) — exact SVG bezier, scaled ──
    const SLING_PATHS_SVG = [
        {
            draw(c) {
                c.moveTo(111,431); c.lineTo(111,298);
                c.bezierCurveTo(111,290,121,287,125,293);
                c.lineTo(234,453);
                c.bezierCurveTo(237,458,234,463,228,462);
                c.lineTo(123,445);
                c.bezierCurveTo(116,444,111,438,111,431);
            },
            dots: [[129,328],[133,423],[207,443]],
        },
        {
            draw(c) {
                c.moveTo(607,431); c.lineTo(607,298);
                c.bezierCurveTo(607,290,597,287,593,293);
                c.lineTo(484,453);
                c.bezierCurveTo(481,458,485,463,490,462);
                c.lineTo(595,445);
                c.bezierCurveTo(602,444,607,438,607,431);
            },
            dots: [[589,328],[586,423],[511,443]],
        },
    ];
    slings.forEach((s, idx) => {
        const bright = s.flash > 0;
        const sp = SLING_PATHS_SVG[idx];
        const grad = ctx.createLinearGradient(0, 293, 0, 463);
        grad.addColorStop(0, '#060D02');
        grad.addColorStop(1, bright ? '#3A7800' : '#2A5800');
        ctx.beginPath(); sp.draw(ctx); ctx.closePath();
        ctx.fillStyle = grad; ctx.fill();
        ctx.strokeStyle = bright ? T.white : T.accent;
        ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
        for (const [dx,dy] of sp.dots) {
            ctx.beginPath(); ctx.arc(dx, dy, 6, 0, Math.PI*2);
            ctx.fillStyle = bright ? T.white : T.accent; ctx.fill();
        }
    });


    // ── Drain chevrons — SVG exact proportions, pointing down ────────
    {
        const dcx  = 360;
        const hw   = 10;                              // half-width → total width 20
        const h    = Math.round(hw * 2 * 0.669);     // = 13, keeps exact SVG ratio
        const gap  = Math.round(h * 0.264);           // = 3
        const step = h + gap;                         // = 16
        const nx   = hw * 0.031;                      // notch x offset ≈ 0.31
        const opacities = [0.6, 0.4, 0.2]; // SVG: top bright (0.6) → bottom dim (0.2)
        for (let i = 0; i < 3; i++) {
            const topY = 545 + i * step;
            const botY = topY + h;
            ctx.globalAlpha = opacities[i];
            const grad = ctx.createLinearGradient(dcx, topY, dcx, botY);
            grad.addColorStop(0, '#060D02');
            grad.addColorStop(1, '#2A5800');
            // Downward chevron: wide top with V-notch at top center, pointed bottom tip
            ctx.beginPath();
            ctx.moveTo(dcx,       botY);               // bottom center tip
            ctx.lineTo(dcx - hw,  topY + h * 0.676);  // left shoulder
            ctx.lineTo(dcx - hw,  topY);               // left top corner
            ctx.lineTo(dcx - nx,  topY + h * 0.314);  // center-left notch
            ctx.lineTo(dcx,       topY + h * 0.317);  // center top notch tip
            ctx.lineTo(dcx + nx,  topY + h * 0.314);  // center-right notch
            ctx.lineTo(dcx + hw,  topY);               // right top corner
            ctx.lineTo(dcx + hw,  topY + h * 0.676);  // right shoulder
            ctx.closePath();
            ctx.fillStyle   = grad;
            ctx.fill();
            ctx.strokeStyle = '#138000';
            ctx.lineWidth   = 1;
            ctx.lineJoin    = 'round';
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    ctx.lineCap = 'butt';
}

function drawBumpers() {
    bumpers.forEach((b, i) => {
        const bright  = b.flash > 0;
        const isSmall = i >= 4;

        if (isSmall) {
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
            ctx.fillStyle = bright ? T.white : T.accent; ctx.fill();
            return;
        }

        // Outer glow on hit
        if (bright) {
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 10, 0, Math.PI*2);
            ctx.fillStyle = 'rgba(129,244,22,0.12)'; ctx.fill();
        }

        // Gradient fill — matching Figma SVG (#060D02 → #2A5800 top→bottom)
        const grad = ctx.createLinearGradient(b.x, b.y - b.r, b.x, b.y + b.r);
        grad.addColorStop(0, '#060D02');
        grad.addColorStop(1, bright ? '#3A7800' : '#2A5800');

        // Outer circle
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
        ctx.fillStyle   = grad; ctx.fill();
        ctx.strokeStyle = bright ? T.white : T.accent;
        ctx.lineWidth   = 2;
        ctx.stroke();

        // Inner dashed circle — exact Figma ratio 13/17, dasharray [2,2]
        const innerR = Math.round(b.r * (13 / 17));
        ctx.beginPath(); ctx.arc(b.x, b.y, innerR, 0, Math.PI*2);
        ctx.strokeStyle = bright ? T.accent : '#138000';
        ctx.lineWidth   = 1;
        ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]);

        // Point label
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = bright ? T.white : T.accent;
        ctx.font         = b.r >= 20
            ? 'bold 22px "JetBrains Mono",monospace'
            : 'bold 11px "JetBrains Mono",monospace';
        ctx.fillText(b.pts, b.x, b.y);
    });
}

function drawFlippers() {
    // Kicker guide shapes from SVG paths 14/17 — exact scaled bezier coords
    const KICKER = [
        {
            draw(c) {
                c.moveTo(215, 498);
                c.bezierCurveTo(217, 490, 225, 485, 233, 487);
                c.lineTo(329, 515);
                c.bezierCurveTo(334, 517, 338, 522, 336, 528);
                c.bezierCurveTo(335, 533, 330, 537, 325, 535);
                c.lineTo(226, 516);
                c.bezierCurveTo(218, 514, 213, 506, 215, 498);
            },
            dot: [229, 501],
        },
        {
            draw(c) {
                c.moveTo(504, 498);
                c.bezierCurveTo(502, 490, 493, 485, 485, 487);
                c.lineTo(389, 515);
                c.bezierCurveTo(384, 517, 381, 522, 382, 528);
                c.bezierCurveTo(383, 533, 388, 537, 394, 535);
                c.lineTo(492, 516);
                c.bezierCurveTo(500, 514, 505, 506, 504, 498);
            },
            dot: [489, 501],
        },
    ];

    for (let i = 0; i < flippers.length; i++) {
        const f      = flippers[i];
        const bright = f.active;
        const k      = KICKER[i];
        const delta  = f.angle - f.restAngle; // rotation from SVG rest position

        ctx.save();
        ctx.translate(f.pivot.x, f.pivot.y);
        ctx.rotate(delta);
        ctx.translate(-f.pivot.x, -f.pivot.y);

        const kg = ctx.createLinearGradient(0, 485, 0, 537);
        kg.addColorStop(0, '#060D02');
        kg.addColorStop(1, bright ? '#3A7800' : '#2A5800');

        ctx.beginPath(); k.draw(ctx); ctx.closePath();
        ctx.fillStyle   = kg; ctx.fill();
        ctx.strokeStyle = bright ? T.white : T.accent;
        ctx.lineWidth   = 2; ctx.lineJoin = 'round'; ctx.stroke();

        ctx.beginPath();
        ctx.arc(k.dot[0], k.dot[1], 3, 0, Math.PI * 2);
        ctx.fillStyle = bright ? T.white : T.accent;
        ctx.fill();

        ctx.restore();
    }
}

function drawSpring() {
    const cx = 651;

    if (!ball.inLane) {
        // Resting spring — static obstacle visible after launch
        const sTop = PLUNGER_EXIT_Y + BALL_R + 20;
        const sBot = PLUNGER_FLOOR_Y - 4;
        const sh   = sBot - sTop;
        if (sh > 4) {
            const coils = 7, amp = 7, steps = coils * 2;
            ctx.beginPath();
            ctx.moveTo(cx, sTop);
            for (let i = 1; i <= steps; i++) {
                ctx.lineTo(cx + (i % 2 === 0 ? -amp : amp), sTop + i / steps * sh);
            }
            ctx.lineTo(cx, sBot);
            ctx.strokeStyle = T.dim; ctx.lineWidth = 1.8;
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            ctx.stroke();
        }
        ctx.fillStyle = T.dim;
        ctx.fillRect(cx - 14, PLUNGER_FLOOR_Y - 4, 28, 5);
        ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
        return;
    }

    const comp  = (gameState === 'ready') ? plunger.charge : 0;
    // Ball visual position (pulled down while charging)
    const ballY = (gameState === 'ready') ? ball.y + comp * 22 : ball.y;
    const sTop  = ballY + BALL_R + 3;          // spring top — just below ball
    const sBot  = PLUNGER_FLOOR_Y - 4;        // spring bottom — just above base plate
    const sh    = sBot - sTop;

    if (sh < 4) return;

    // ── Spring coils (zigzag) ───────────────────────────────────────
    const coils = 7;
    const amp   = 7 - comp * 2.5;   // amplitude narrows when compressed
    const steps = coils * 2;

    ctx.beginPath();
    ctx.moveTo(cx, sTop);
    for (let i = 1; i <= steps; i++) {
        const t  = i / steps;
        const y  = sTop + t * sh;
        const x  = cx + (i % 2 === 0 ? -amp : amp);
        ctx.lineTo(x, y);
    }
    ctx.lineTo(cx, sBot);

    ctx.strokeStyle = comp > 0.75 ? T.white : (comp > 0.25 ? T.accent : T.dim);
    ctx.lineWidth   = 1.8;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();

    // ── Base plate ──────────────────────────────────────────────────
    ctx.fillStyle = T.accent;
    ctx.fillRect(cx - 14, PLUNGER_FLOOR_Y - 4, 28, 5);

    // ── Small plunger rod connecting ball to spring top ─────────────
    ctx.beginPath();
    ctx.moveTo(cx, ballY + BALL_R); ctx.lineTo(cx, sTop);
    ctx.strokeStyle = T.dim; ctx.lineWidth = 1.5;
    ctx.stroke();

    // ── Launch arrows — SVG exact proportions (13:8.7 w:h ratio) ───
    {
        // SVG chevron: w=13, h=8.7 → ratio h/w=0.669
        // shoulder_frac=0.324, notch_y_frac=0.314, notch_x_frac=0.031
        const hw   = 9;                 // half-width → total width 18
        const h    = Math.round(hw * 2 * 0.669); // = 12, keeps exact SVG ratio
        const gap  = Math.round(h * 0.264);      // = 3, matches SVG inter-chevron gap
        const step = h + gap;           // = 15
        const nx   = hw * 0.031;        // notch x offset from center ≈ 0.28
        const opacities = [1.0, 0.8, 0.6, 0.4, 0.2]; // bottom (bright) → top (faint)
        for (let i = 0; i < 5; i++) {
            const botY = ballY - BALL_R - 6 - i * step;
            const topY = botY - h;
            ctx.globalAlpha = opacities[i];
            const grad = ctx.createLinearGradient(cx, topY, cx, botY);
            grad.addColorStop(0, '#060D02');
            grad.addColorStop(1, '#2A5800');
            ctx.beginPath();
            ctx.moveTo(cx,      topY);              // top center point
            ctx.lineTo(cx + hw, topY + h * 0.324);  // right shoulder
            ctx.lineTo(cx + hw, botY);               // right bottom corner
            ctx.lineTo(cx + nx, botY - h * 0.314);  // center-right notch
            ctx.lineTo(cx,      botY - h * 0.317);  // center notch tip
            ctx.lineTo(cx - nx, botY - h * 0.314);  // center-left notch
            ctx.lineTo(cx - hw, botY);               // left bottom corner
            ctx.lineTo(cx - hw, topY + h * 0.324);  // left shoulder
            ctx.closePath();
            ctx.fillStyle   = grad;
            ctx.fill();
            ctx.strokeStyle = '#138000';
            ctx.lineWidth   = 1;
            ctx.lineJoin    = 'round';
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
}

function drawBall() {
    if (gameState === 'gameover') return;
    const drawY = (ball.inLane && gameState === 'ready') ? ball.y + plunger.charge*22 : ball.y;
    ctx.save();
    ctx.translate(ball.x, drawY);
    ctx.rotate(ball.angle);
    ctx.drawImage(smileyImg, -BALL_R, -BALL_R, BALL_R*2, BALL_R*2);
    ctx.restore();
}

function drawHUD() {
    scoreDisp += (score - scoreDisp) * 0.12;

    // Score — center of field, between the bumpers (matching Figma design)
    ctx.textAlign    = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle    = T.dim;
    ctx.font         = '10px "JetBrains Mono",monospace';
    ctx.fillText('SCORE', 361, 220);
    ctx.fillStyle    = T.scoreHigh;
    ctx.font         = 'italic bold 38px "JetBrains Mono",monospace';
    ctx.fillText(Math.round(scoreDisp).toString(), 361, 248);
    ctx.fillStyle    = T.dim;
    ctx.font         = '8px "JetBrains Mono",monospace';
    ctx.fillText(`HI  ${hiScore.toString().padStart(7,'0')}`, 361, 280);

    // Combo — below the top bumper (bumper bottom = y 187), above SCORE label
    if (combo >= 2) {
        ctx.fillStyle = combo >= 5 ? T.white : T.accent;
        ctx.font      = `bold ${9 + Math.min(combo, 7)}px "JetBrains Mono",monospace`;
        ctx.fillText(`${combo}× COMBO`, 361, 202);
    }

    // Lives — bottom center, below the drain gap
    const totalW = (lives - 1) * 20;
    for (let i = 0; i < lives; i++)
        ctx.drawImage(smileyImg, 360 - totalW/2 + i*20 - 8, 560, 16, 16);

    // "HOLD SPACE" hint near plunger when not charging
    if (gameState === 'ready' && plunger.charge === 0) {
        ctx.fillStyle    = T.dimmer;
        ctx.font         = '8px "JetBrains Mono",monospace';
        ctx.textAlign    = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('HOLD SPACE', 651, PLUNGER_FLOOR_Y + 14);
    }
}

// ── Screen overlays ─────────────────────────────
function drawMenu() {
    buttons = [];
    ctx.fillStyle = T.bg; ctx.fillRect(0,0,W,H);

    // ── Title ───────────────────────────────────────────────────────
    const titleText = 'ZERO FLIPPER';
    ctx.font      = '700 47px "JetBrains Mono",monospace';
    ctx.fillStyle = T.white;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const metrics   = ctx.measureText(titleText);
    const titleW    = metrics.width;
    const textH     = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    const smSize    = Math.round(textH);
    const smGap     = 12;
    const smCenterY = 80 + (metrics.actualBoundingBoxDescent - metrics.actualBoundingBoxAscent) / 2;
    const smY       = smCenterY - smSize / 2;
    ctx.drawImage(smileyImg, W/2 - titleW/2 - smGap - smSize, smY, smSize, smSize);
    ctx.drawImage(smileyImg, W/2 + titleW/2 + smGap,          smY, smSize, smSize);
    ctx.fillText(titleText, W/2, 80);

    // ── Subtitle ────────────────────────────────────────────────────
    ctx.font = '600 16px "JetBrains Mono",monospace';
    ctx.fillStyle = T.white;
    ctx.fillText('CLASSIC  ARCADE', W/2, 122);

    // ── Name input ──────────────────────────────────────────────────
    ctx.font = '600 10px "JetBrains Mono",monospace';
    ctx.fillStyle = T.dim;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('YOUR  NAME', W/2, 162);
    const inW = 400, inH = 38, inX = W/2 - inW/2, inY = 175;
    ctx.fillStyle = T.btnBg;
    ctx.beginPath(); ctx.roundRect(inX, inY, inW, inH, 3); ctx.fill();
    ctx.strokeStyle = T.accent; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(inX, inY, inW, inH, 3); ctx.stroke();
    ctx.font = '600 14px "JetBrains Mono",monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const blink = cursorBlink % 60 < 30 ? '▌' : '';
    if (playerName) {
        ctx.fillStyle = T.white;
        ctx.fillText(playerName + blink, W/2, inY + inH/2);
    } else {
        ctx.fillStyle = T.dim;
        ctx.fillText('TYPE  YOUR  NAME' + (cursorBlink % 60 < 30 ? '  ▌' : ''), W/2, inY + inH/2);
    }

    // ── Controls — vertically centred in gap, horizontally centred on screen ──
    const controls = [
        ['←',     'LEFT FLIPPER'],
        ['→',     'RIGHT FLIPPER'],
        ['SPACE', 'HOLD & RELEASE TO LAUNCH'],
    ];
    const ctrlRowH   = 30;
    const ctrlGroupH = (controls.length - 1) * ctrlRowH;
    const gapTop     = inY + inH;   // bottom of name input
    const gapBot     = 352;         // top of PLAY button
    const ctrlStartY = Math.round((gapTop + gapBot) / 2 - ctrlGroupH / 2);
    ctx.font = '600 13px "JetBrains Mono",monospace';
    ctx.textBaseline = 'middle';
    // measure actual column widths so the group is truly screen-centred
    const innerGap = 24;
    const keyColW  = Math.max(...controls.map(([k])    => ctx.measureText(k).width));
    const descColW = Math.max(...controls.map(([,d])   => ctx.measureText(d).width));
    const groupW   = keyColW + innerGap + descColW;
    const keyX     = Math.round(W/2 - groupW/2 + keyColW);   // right edge of key column
    const descX    = keyX + innerGap;                          // left edge of desc column
    controls.forEach(([key, desc], i) => {
        const cy = ctrlStartY + i * ctrlRowH;
        ctx.textAlign = 'right'; ctx.fillStyle = T.accent;
        ctx.fillText(key, keyX, cy);
        ctx.textAlign = 'left';  ctx.fillStyle = T.dim;
        ctx.fillText(desc, descX, cy);
    });

    // ── PLAY button — solid green like Crash Pong ────────────────────
    const bw = 400, bh = 52;
    let by = 352;
    ctx.fillStyle = T.accent;
    ctx.beginPath(); ctx.roundRect(W/2 - bw/2, by, bw, bh, 4); ctx.fill();
    ctx.font = '700 17px "JetBrains Mono",monospace';
    ctx.fillStyle = T.bg;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('▶  PRESS SPACE TO PLAY', W/2, by + bh/2);
    reg(W/2 - bw/2, by, bw, bh, () => startGame());

    // ── LEADERBOARD button ───────────────────────────────────────────
    by += bh + 16;
    rBtn(W/2 - bw/2, by, bw, 40);
    ctx.font = '700 14px "JetBrains Mono",monospace';
    ctx.fillStyle = T.dim;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('LEADERBOARD', W/2, by + 20);
    reg(W/2 - bw/2, by, bw, 40, () => { gameState = 'leaderboard'; });

    // ── Hi-score ─────────────────────────────────────────────────────
    if (hiScore > 0) {
        ctx.fillStyle = T.dimmer; ctx.font = '11px "JetBrains Mono",monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = T.dim;
        ctx.fillText(`BEST  ${hiScore.toString().padStart(7,'0')}`, W/2, by + 56);
    }
}

function drawPaused() {
    buttons = [];
    ctx.fillStyle = T.overlay; ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 46px "JetBrains Mono",monospace';
    ctx.fillStyle = T.white;
    ctx.fillText('PAUSED', W/2, H/2 - 68);

    // ▶ resume icon
    const iconR = 28, iconX = W/2, iconY = H/2 - 6;
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconR, 0, Math.PI * 2);
    ctx.strokeStyle = T.accent; ctx.lineWidth = 2; ctx.stroke();
    ctx.font = '700 24px "JetBrains Mono",monospace';
    ctx.fillStyle = T.accent;
    ctx.fillText('▶', iconX + 2, iconY);
    reg(iconX - iconR, iconY - iconR, iconR * 2, iconR * 2, () => { gameState = 'playing'; });

    // Sound toggle
    const sw = 190, sh = 34, sxb = W/2 - sw/2, syb = H/2 + 42;
    rBtn(sxb, syb, sw, sh);
    ctx.font = '500 11px "JetBrains Mono",monospace';
    ctx.fillStyle = settings.sound ? T.accent : T.dim;
    ctx.fillText(settings.sound ? '♪  SOUND  ON' : '♩  SOUND  OFF', W/2, syb + sh/2);
    reg(sxb, syb, sw, sh, () => { settings.sound = !settings.sound; });

    // Main menu
    const bw = 190, bh = 34, bx = W/2 - bw/2, by = H/2 + 90;
    rBtn(bx, by, bw, bh);
    ctx.font = '500 11px "JetBrains Mono",monospace';
    ctx.fillStyle = T.dim;
    ctx.fillText('MAIN MENU', W/2, by + bh/2);
    reg(bx, by, bw, bh, () => { gameState = 'menu'; });
}

function drawInGameMenu() {
    buttons = [];
    ctx.fillStyle = T.overlay; ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 46px "JetBrains Mono",monospace';
    ctx.fillStyle = T.white;
    ctx.fillText('MENU', W/2, H/2 - 80);

    const bw = 220, bh = 42, bx = W/2 - bw/2;

    // Continue
    const cy = H/2 - 12;
    ctx.fillStyle = T.dimmer;
    ctx.beginPath(); ctx.roundRect(bx, cy, bw, bh, 4); ctx.fill();
    ctx.strokeStyle = T.accent; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bx, cy, bw, bh, 4); ctx.stroke();
    ctx.font = '700 13px "JetBrains Mono",monospace';
    ctx.fillStyle = T.accent;
    ctx.fillText('▶  CONTINUE', W/2, cy + bh/2);
    reg(bx, cy, bw, bh, () => { gameState = prevGameState; });

    // Start Over
    const sy = cy + bh + 16;
    rBtn(bx, sy, bw, bh);
    ctx.font = '500 13px "JetBrains Mono",monospace';
    ctx.fillStyle = T.dim;
    ctx.fillText('START OVER', W/2, sy + bh/2);
    reg(bx, sy, bw, bh, () => { gameState = 'menu'; });
}

function drawLeaderboard() {
    buttons = [];
    ctx.fillStyle = T.bg; ctx.fillRect(0,0,W,H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 36px "JetBrains Mono",monospace';
    ctx.fillStyle = T.white;
    ctx.fillText('LEADERBOARD', W/2, 62);

    ctx.setLineDash([]);
    ctx.strokeStyle = T.label; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(24, 90); ctx.lineTo(W-24, 90); ctx.stroke();

    if (leaderboard.length === 0) {
        ctx.font = '400 13px "JetBrains Mono",monospace';
        ctx.fillStyle = T.dim;
        ctx.fillText('NO  RECORDS  YET', W/2, H/2);
        ctx.font = '400 9px "JetBrains Mono",monospace';
        ctx.fillStyle = T.label;
        ctx.fillText('PLAY  WITH  YOUR  NAME  TO  APPEAR  HERE', W/2, H/2 + 28);
    } else {
        ctx.font = '600 9px "JetBrains Mono",monospace';
        ctx.fillStyle = T.label;
        ctx.textAlign = 'left';
        ctx.fillText('#',     60,  108);
        ctx.fillText('NAME',  100, 108);
        ctx.textAlign = 'right';
        ctx.fillText('SCORE', W - 60, 108);

        leaderboard.slice(0, 12).forEach((entry, i) => {
            const ry = 132 + i * 32;
            if (i < 3) {
                ctx.fillStyle = T.dimmer;
                ctx.beginPath(); ctx.roundRect(44, ry-12, W-88, 26, 2); ctx.fill();
            }
            const col = [T.accent, T.white, T.dim][i] ?? T.dim;
            ctx.fillStyle = col;
            ctx.font = `${i < 3 ? '700' : '400'} 12px "JetBrains Mono",monospace`;
            ctx.textAlign = 'left';
            ctx.fillText(`${i+1}.`,                60,  ry);
            ctx.fillText(entry.name.slice(0,12),   100, ry);
            ctx.textAlign = 'right';
            ctx.fillText(entry.score.toString().padStart(7,'0'), W-60, ry);
        });
    }

    const bw = 200, bh = 36, by = H - 66;
    rBtn(W/2-bw/2, by, bw, bh);
    ctx.font = '700 12px "JetBrains Mono",monospace';
    ctx.fillStyle = T.dim;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('← BACK', W/2, by + bh/2);
    reg(W/2-bw/2, by, bw, bh, () => { gameState = 'menu'; });
}

function drawGameOver() {
    buttons = [];
    ctx.fillStyle = T.overlay; ctx.fillRect(0,0,W,H);
    ctx.drawImage(sadfaceImg, W/2-40, H/2-148, 80, 80);
    ctx.fillStyle = T.accent; ctx.font = 'bold 44px "JetBrains Mono",monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('GAME OVER', W/2, H/2-28);
    ctx.fillStyle = T.white; ctx.font = 'bold 30px "JetBrains Mono",monospace';
    ctx.fillText(score.toString().padStart(7,'0'), W/2, H/2+22);
    if (score > 0 && score >= hiScore) {
        ctx.fillStyle = T.accent; ctx.font = 'bold 14px "JetBrains Mono",monospace';
        ctx.fillText('★  NEW BEST  ★', W/2, H/2+58);
    }
    const bw = 280, bh = 40;
    let by = H/2 + 92;
    rBtn(W/2-bw/2, by, bw, bh);
    ctx.font = '700 15px "JetBrains Mono",monospace';
    ctx.fillStyle = T.accent;
    ctx.fillText('▶  PLAY  AGAIN', W/2, by + bh/2);
    reg(W/2-bw/2, by, bw, bh, () => startGame());
    by += bh + 10;
    rBtn(W/2-bw/2, by, bw, bh);
    ctx.fillStyle = T.dim;
    ctx.fillText('LEADERBOARD', W/2, by + bh/2);
    reg(W/2-bw/2, by, bw, bh, () => { gameState = 'leaderboard'; });
}

// ── CRT post-processing ─────────────────────────
let noiseFrame = 0;

function drawCRTOverlay() {
    const t = performance.now()/1000;
    glowCtx.clearRect(0,0,W,H);
    glowCtx.filter = 'blur(8px)';
    glowCtx.drawImage(canvas,0,0);
    glowCtx.filter = 'none';
    ctx.save(); ctx.globalCompositeOperation='screen'; ctx.globalAlpha=0.28;
    ctx.drawImage(glowCanvas,0,0); ctx.restore();
    ctx.save(); ctx.globalAlpha=0.07;
    for (let y=0;y<H;y+=3){ctx.fillStyle='#000';ctx.fillRect(0,y,W,1);}
    ctx.restore();
    if (noiseFrame++%2===0) {
        const id=noiseCtx.createImageData(180,147);
        for (let i=0;i<id.data.length;i+=4){
            const v=Math.random()*32|0;
            id.data[i]=0;id.data[i+1]=v*1.9;id.data[i+2]=0;id.data[i+3]=Math.random()*20;
        }
        noiseCtx.putImageData(id,0,0);
    }
    ctx.save(); ctx.globalCompositeOperation='screen'; ctx.globalAlpha=0.5;
    ctx.drawImage(noiseCanvas,0,0,W,H); ctx.restore();
    const vig=ctx.createRadialGradient(W/2,H/2,H*0.3,W/2,H/2,H*0.75);
    vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(0,0,0,0.55)');
    ctx.fillStyle=vig; ctx.fillRect(0,0,W,H);
    const flicker=Math.sin(t*8.3)*0.009+Math.sin(t*27.1)*0.006+(Math.random()-0.5)*0.018;
    if (flicker<0){ctx.save();ctx.fillStyle=`rgba(0,0,0,${(-flicker).toFixed(3)})`;ctx.fillRect(0,0,W,H);ctx.restore();}
}

// ── HUD icon buttons (sound / pause / menu) ────
function drawHUDButtons() {
    const BW = 36, BH = 36, GAP = 4;
    const x0 = 530, x1 = x0 + BW + GAP, x2 = x1 + BW + GAP;
    const y  = 68;

    function btnBg(x, col) {
        ctx.fillStyle = col || 'rgba(5,12,1,0.88)';
        ctx.beginPath(); ctx.roundRect(x, y, BW, BH, 5); ctx.fill();
        ctx.strokeStyle = T.btnBorder; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(x, y, BW, BH, 5); ctx.stroke();
    }

    function hovering(x) {
        return mouseX >= x && mouseX <= x+BW && mouseY >= y && mouseY <= y+BH;
    }

    // ── Sound ────────────────────────────────────
    btnBg(x0, hovering(x0) ? 'rgba(129,244,22,0.10)' : undefined);
    ctx.save();
    const scol = settings.sound ? T.accent : T.dim;
    ctx.fillStyle = scol; ctx.strokeStyle = scol;
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    const sx = x0 + BW/2 - 1.5, sy = y + BH/2;
    ctx.beginPath();
    ctx.moveTo(sx-9, sy-5); ctx.lineTo(sx-3, sy-5);
    ctx.lineTo(sx+5, sy-11); ctx.lineTo(sx+5, sy+11);
    ctx.lineTo(sx-3, sy+5); ctx.lineTo(sx-9, sy+5);
    ctx.closePath(); ctx.fill();
    if (settings.sound) {
        ctx.beginPath(); ctx.arc(sx+5, sy, 7, -0.72, 0.72); ctx.stroke();
    } else {
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(sx+8, sy-6); ctx.lineTo(sx+14, sy+6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx+14, sy-6); ctx.lineTo(sx+8, sy+6); ctx.stroke();
    }
    ctx.restore();
    reg(x0, y, BW, BH, () => { settings.sound = !settings.sound; });

    // ── Pause / Resume ────────────────────────────
    btnBg(x1, hovering(x1) ? 'rgba(129,244,22,0.10)' : undefined);
    ctx.save();
    ctx.fillStyle = T.accent;
    const px = x1 + BW/2, py = y + BH/2;
    if (gameState === 'paused') {
        ctx.beginPath();
        ctx.moveTo(px-6, py-7); ctx.lineTo(px+10, py); ctx.lineTo(px-6, py+7);
        ctx.closePath(); ctx.fill();
    } else {
        ctx.fillRect(px-7, py-7, 5, 14);
        ctx.fillRect(px+2, py-7, 5, 14);
    }
    ctx.restore();
    reg(x1, y, BW, BH, () => {
        if (gameState === 'playing' || gameState === 'ready') gameState = 'paused';
        else if (gameState === 'paused') gameState = 'playing';
    });

    // ── Menu (hamburger) ─────────────────────────
    btnBg(x2, hovering(x2) ? 'rgba(129,244,22,0.10)' : undefined);
    ctx.save();
    ctx.strokeStyle = T.dim; ctx.lineWidth = 2; ctx.lineCap = 'round';
    const mx = x2 + BW/2, my = y + BH/2;
    [-7, 0, 7].forEach(dy => {
        ctx.beginPath(); ctx.moveTo(mx-9, my+dy); ctx.lineTo(mx+9, my+dy); ctx.stroke();
    });
    ctx.restore();
    reg(x2, y, BW, BH, () => { prevGameState = gameState; gameState = 'ingame-menu'; });
}

// ── Main draw ───────────────────────────────────
function draw() {
    ctx.fillStyle = T.bg; ctx.fillRect(0,0,W,H);
    ctx.save();
    ctx.setTransform(1.828,0,0,1.835,19.6,20.9);
    ctx.beginPath(); ctx.clip(organicClipPath);
    ctx.setTransform(1,0,0,1,0,0);
    if (gameState === 'menu') {
        drawMenu();
    } else if (gameState === 'leaderboard') {
        drawLeaderboard();
    } else {
        buttons = [];
        ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
        drawField();
        drawBumpers();
        drawFlippers();
        drawSpring();
        drawBall();
        drawHUD();
        if (gameState==='paused')      drawPaused();
        if (gameState==='ingame-menu') drawInGameMenu();
        if (gameState==='gameover')    drawGameOver();
        if (gameState !== 'gameover' && gameState !== 'ingame-menu') drawHUDButtons();
    }
    drawCursor();
    ctx.restore();
    drawCRTOverlay();
}

// ── Main loop ───────────────────────────────────
function loop() { cursorBlink++; update(); draw(); requestAnimationFrame(loop); }
loop();

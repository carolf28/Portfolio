(() => {
  /* =====================================================================
     TWEAK ME
     Two textures (layer A and layer B) are rendered by the same shader.
     Layer B slowly shows through layer A in drifting patches.
     All colors are RGB 0..1.
     ===================================================================== */
  const CONFIG = {
    speed: 0.003,        // base drift (lower = slower)
    breath: 0.15,        // speed of every fade in / fade out cycle (lower = slower)
    grain: 0.035,        // film grain (0 = off)
    overlay: 0.9,        // max opacity of layer B where it shows (0 = layer A only, 1 = fully covers)
    blur: 0.92,          // 0 = crisp wisps, 1 = fully out of focus (fades fine detail, softens every edge)
    frost: 0.6,          // frosted-glass feel: milky light scatter, sandblasted speckle, tiny refraction (0 = off)

    // ---- Audio reactivity: pick a track with the on-page button, or preset one with src ----
    audio: {
      src: 'ambient.mp3',           // optional track to preload, e.g. 'ambient.mp3' (visitor still presses Play; browsers block autoplay)
      amount: 1.0,       // overall reactivity (0 = ignore audio)
      flow: 0.15,        // extra flow that loudness adds to the drift (raise for more visible movement)
      morph: 0.6,        // how much bass and mids deepen the folds of the smoke (0 = shapes keep their form)
      attack: 0.5,       // seconds to swell up  (higher = lazier, more ethereal)
      release: 1.8,      // seconds to fade back down
      volume: 0.8,       // starting volume 0..1
    },
    maxDPR: 1.25,        // cap resolution for performance (raise to 1.5 for crisper detail)

    // ---- Layer A: sage / lavender cloud with rising shadows ----
    layerA: {
      scale: 0.85,       // bigger = larger, softer shapes
      warp: 1.8,         // how much the smoke folds into itself
      stretch: 0.7,      // <1 = horizontal smears, 1 = round
      angle: -0.35,      // flow direction (radians)
      negative: 1.0,     // 1 = light/dark of the pattern flipped
      stain: 0.6,        // hard-edged blotchiness (0 = soft smoke)
      detail: 0.3,       // wispy veins
      fiber: 0.05,       // fine hairline streaks
      accentStrength: 0.75,
      shadow: 0.4,       // rising / fading shadows
      rim: 0.10,         // dried tide-lines
      sheen: 0.10,       // slow plastic-like highlight
      seed: [0.0, 0.0],  // moves the pattern around without changing its character
      colors: [
        [0.11, 0.07, 0.14],   // deep plum black (shadows)  ~ #1C1224
        [0.65, 0.65, 0.77],   // wisteria grey              #A6A5C4
        [0.75, 0.82, 0.77],   // celadon ceramic grey       #BED2C3
        [0.98, 0.98, 0.97],   // off white
      ],
      accents: [
        [0.80, 0.72, 0.79],   // blush mauve
        [0.72, 0.70, 0.85],   // light wisteria
        [0.70, 0.84, 0.76],   // fresh celadon mint
      ],
    },

    // ---- Layer B: musty silver / purple, rounder marbled swirls ----
    layerB: {
      scale: 1.5,
      warp: 2.0,         // higher warp = more marbled, curling swirls
      stretch: 0.9,      // rounder shapes than layer A
      angle: 0.9,        // flows on a different diagonal
      negative: 0.0,     // light wisps lifting out of a darker ground
      stain: 0.35,
      detail: 0.8,       // more veined than A
      fiber: 0.14,
      accentStrength: 0.7,
      shadow: 0.45,
      rim: 0.08,
      sheen: 0.14,
      seed: [13.0, 4.0],
      colors: [
        [0.16, 0.11, 0.19],   // dusk plum (shadows)
        [0.75, 0.82, 0.77],   // celadon ceramic grey   #BED2C3
        [0.65, 0.65, 0.77],   // wisteria grey          #A6A5C4
        [0.96, 0.95, 0.97],   // pearl
      ],
      accents: [
        [0.76, 0.66, 0.74],   // dusty rose mauve
        [0.62, 0.62, 0.74],   // grey lavender
        [0.66, 0.74, 0.68],   // soft celadon grey
      ],
    },
  };
  /* ===================================================================== */

  const canvas = document.getElementById('ethereal');
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return; // CSS fallback stays visible

  const vert = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

  const frag = `
  precision highp float;

  uniform vec2  uRes;
  uniform float uTime, uBreath, uGrain, uOverlay, uBlur, uFrost, uMorph;
  uniform vec4  uAudio;   // smoothed bass, mid, high, overall level (0..1)

  // Per layer: geo = (scale, warp, stretch, angle)
  //            look = (negative, stain, detail, fiber)
  //            misc = (accent, shadow, rim, sheen)
  uniform vec4 uAGeo, uALook, uAMisc;
  uniform vec4 uBGeo, uBLook, uBMisc;
  uniform vec2 uASeed, uBSeed;
  uniform vec3 uPalA[4];
  uniform vec3 uAccA[3];
  uniform vec3 uPalB[4];
  uniform vec3 uAccB[3];

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), u.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
  }

  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 5; i++){
      // blur fades out the fine octaves, so everything dissolves into soft haze
      float wgt = (i < 3) ? 1.0 : (1.0 - uBlur);   // three soft scales stay, only the finest fade
      v += a * wgt * noise(p);
      p = r * p * 2.02 + 7.3;
      a *= 0.5;
    }
    return v / (0.875 + 0.09375 * (1.0 - uBlur)) * 0.96875;  // keep the same overall range
  }

  // Ridged noise: sharp creases = veins and wisps
  float ridgedFbm(vec2 p){
    float v = 0.0, a = 0.5;
    mat2 rm = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 5; i++){
      float n = 1.0 - abs(noise(p) * 2.0 - 1.0);
      v += a * n * n;
      p = rm * p * 2.1 + 3.7;
      a *= 0.5;
    }
    return v;
  }

  vec3 palette(float t, vec3 c0, vec3 c1, vec3 c2, vec3 c3){
    t = clamp(t, 0.0, 1.0);
    if (t < 0.40) return mix(c0, c1, smoothstep(0.0, 0.40, t));
    if (t < 0.75) return mix(c1, c2, smoothstep(0.40, 0.75, t));
    return mix(c2, c3, smoothstep(0.75, 1.0, t));
  }

  // One complete texture. Called once for layer A and once for layer B.
  vec3 layer(vec2 fc, float t, float br, vec2 seed, vec4 geo, vec4 look, vec4 misc,
             vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 a0, vec3 a1, vec3 a2){

    vec2 uv = fc / uRes;
    vec2 p = (fc - 0.5 * uRes) / min(uRes.x, uRes.y);

    // tilt + stretch + scale
    float ang = geo.w;
    p = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p;
    p.x *= geo.z;
    p *= geo.x;
    p += seed;
    // frosted-glass micro refraction: a tiny static ripple, like light bending through rough glass
    p += (vec2(noise(fc * 0.035), noise(fc * 0.035 + 9.0)) - 0.5) * 0.012 * uFrost;

    // bass and mids deepen the folds, so the shapes visibly morph with the music
    float warp = geo.y * (1.0 + uMorph * uAudio.x + 0.5 * uMorph * uAudio.y);

    // Domain warping: noise bent by noise bent by noise
    vec2 q = vec2(fbm(p + vec2(0.0, t)),
                  fbm(p + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(p + warp * q + vec2(1.7, 9.2) + 0.7 * t),
                  fbm(p + warp * q + vec2(8.3, 2.8) - 0.6 * t));
    float f = fbm(p + warp * r);

    // Tone
    float tone = smoothstep(0.12, 0.92, f * 1.2 + 0.3 * length(q) - 0.08);
    tone = tone * 0.9 + 0.1 * smoothstep(0.3, 0.7, r.x);
    // extra overlapping soft lobes: more shapes folding over and through each other
    tone += 0.20 * (fbm(p * 1.7 + r * 1.3 + vec2(6.0, 2.0)) - 0.5);
    tone = mix(tone, smoothstep(0.40 - 0.14 * uBlur, 0.60 + 0.14 * uBlur, f + 0.1 * (q.x - 0.5)), look.y * 0.7); // stains, softer edges when blurred
    tone = mix(tone, 1.0 - tone, look.x);                                         // negative
    vec3 col = palette(tone, c0, c1, c2, c3);

    // Drifting accent hues, each fading in and out on its own cycle
    float w  = smoothstep(0.12, 0.45, tone) * (1.0 - smoothstep(0.82, 1.0, tone));
    float mA = smoothstep(0.38, 0.78, q.x + 0.25 * r.y);
    float mB = smoothstep(0.42, 0.80, r.y + 0.20 * q.y);
    float mD = smoothstep(0.40, 0.80, fbm(p * 0.8 + r * 1.6 + vec2(3.1, 6.7) + 0.4 * t));
    float bA = 0.5 + 0.5 * sin(br * 0.55 + 0.4);
    float bB = 0.5 + 0.5 * sin(br * 0.40 + 2.6);
    float bD = 0.5 + 0.5 * sin(br * 0.70 + 4.5);
    float acc = misc.x * (1.0 + 2.0 * uAudio.y);   // mids bring the hues up
    col = mix(col, a0, mA * w * acc * (0.15 + 0.85 * bA));
    col = mix(col, a1, mB * w * acc * 0.9 * (0.15 + 0.85 * bB));
    col = mix(col, a2, mD * w * acc * 0.8 * (0.15 + 0.85 * bD));

    // Pearly sheen
    float glow = pow(clamp(r.x * r.y * 2.4, 0.0, 1.0), 2.0);
    col = mix(col, c3, glow * 0.22 * (1.0 + 0.8 * uAudio.w));

    // Depth of field: some regions crisp, others soft
    float focus = smoothstep(0.35, 0.65, fbm(p * 0.6 + r * 0.8 + vec2(9.1, 2.4)));

    // Veins / wisps (slowly appear and recede)
    float veins = ridgedFbm(p * 2.2 + warp * r * 1.4 + vec2(4.0, 1.0) + 0.5 * t);
    float veinMask = smoothstep(0.35 - 0.10 * uBlur, 0.85 + 0.20 * uBlur, veins);
    float darkBias = 1.0 - tone * 0.5;
    float vBreath = 0.45 + 0.55 * (0.5 + 0.5 * sin(br * 0.8 + 1.3));
    col *= 1.0 - veinMask * look.z * vBreath * mix(0.20, 0.65, focus) * darkBias * (1.0 - 0.55 * uBlur);
    col += pow(veinMask, 6.0) * 0.07 * look.z * vBreath * focus * (1.0 - uBlur);

    // Fine fibrous hairlines
    vec2 fp = p * vec2(0.5, 9.0) + r * 2.0 + vec2(0.0, 0.3 * t);
    float fib = noise(fp) * 0.6 + noise(fp * 2.3 + 11.0) * 0.4;
    col += (fib - 0.5) * look.w * (0.4 + 0.6 * focus) * (0.4 + 0.6 * (1.0 - tone)) * (1.0 - uBlur);

    // Slow translucent-plastic sheen
    float band = sin((uv.x * 0.8 + uv.y * 0.6) * 3.5 + t * 2.0 + r.x * 3.0);
    col += pow(max(band, 0.0), 6.0) * misc.w * (1.0 + 4.0 * uAudio.z) * c3;   // highs brighten the sheen

    // Breathing shadows: rise slowly, hold, fade away (three layers, own cycles)
    float shadows = 0.0;
    for (int i = 0; i < 3; i++){
      float fi = float(i);
      float m = fbm(p * 0.55 + r * 0.9 + vec2(fi * 3.7, fi * 5.3) + vec2(0.0, 0.2 * t * (fi + 1.0)));
      m = smoothstep(0.42 - 0.20 * uAudio.x, 0.78, m);   // bass makes shadows spread
      float life = 0.5 + 0.5 * sin(br * (0.6 + 0.35 * fi) + fi * 2.1);
      life = life * life * (3.0 - 2.0 * life);
      shadows = 1.0 - (1.0 - shadows) * (1.0 - m * life);
    }
    col = mix(col, c0 * 0.85, clamp(shadows * misc.y * (1.0 + 3.0 * uAudio.x), 0.0, 0.9));   // and deepen

    // Dried tide-lines
    float rw = 1.0 + 2.0 * uBlur;   // tide-lines widen into soft bands when blurred
    float edge1 = exp(-pow((f - 0.50) / (0.030 * rw), 2.0));
    float edge2 = exp(-pow((f - 0.64) / (0.022 * rw), 2.0));
    float edge3 = exp(-pow((f - 0.38) / (0.026 * rw), 2.0));
    col -= edge1 * misc.z;
    col += edge2 * misc.z * 0.6;
    col -= edge3 * misc.z * 0.5;

    return col;
  }

  void main(){
    vec2 fc = gl_FragCoord.xy;
    vec2 uv = fc / uRes;
    vec2 pm = (fc - 0.5 * uRes) / min(uRes.x, uRes.y);

    // Where layer B shows through: drifting patches that grow and recede
    float life = 0.5 + 0.5 * sin(uBreath * 0.35 + 1.0);
    life = life * life * (3.0 - 2.0 * life);
    float mk  = fbm(pm * 0.9 + vec2(2.0, 7.0) + vec2(0.3, 0.1) * uTime);
    float mk2 = fbm(pm * 1.6 + vec2(8.0, 1.0) - vec2(0.2, 0.3) * uTime);
    float m = mk * 0.7 + mk2 * 0.3;
    float thr = mix(0.64, 0.46, life) - 0.22 * uAudio.w;   // more energy = more of layer B shows through
    float mask = smoothstep(thr, thr + 0.16, m) * uOverlay;

    vec3 col = layer(fc, uTime, uBreath, uASeed, uAGeo, uALook, uAMisc,
                     uPalA[0], uPalA[1], uPalA[2], uPalA[3], uAccA[0], uAccA[1], uAccA[2]);

    if (mask > 0.002) {
      vec3 colB = layer(fc, uTime * 0.85, uBreath + 2.7, uBSeed, uBGeo, uBLook, uBMisc,
                        uPalB[0], uPalB[1], uPalB[2], uPalB[3], uAccB[0], uAccB[1], uAccB[2]);
      col = mix(col, colB, mask);
      // faint luminous seam where the two textures meet
      col += mask * (1.0 - mask) * 0.10;
    }

    // Frosted glass: milky light scatter lifts the darks and softens contrast,
    // plus a fine, static sandblasted speckle
    vec3 milk = vec3(0.90, 0.91, 0.94);
    col = mix(col, milk, 0.16 * uFrost);
    col = (col - 0.5) * (1.0 - 0.10 * uFrost) + 0.5;
    col += (noise(fc * 0.9) - 0.5) * 0.045 * uFrost;

    // Very gentle vignette
    float vig = smoothstep(1.4, 0.2, length(uv - 0.5) * 1.3);
    col *= mix(0.82, 1.0, vig);

    // Film grain (animated)
    float g = hash(fc + fract(uTime * 7.0) * 100.0) - 0.5;
    col += g * uGrain;

    gl_FragColor = vec4(col, 1.0);
  }`;

  function compile(type, src){
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, vert);
  const fs = compile(gl.FRAGMENT_SHADER, frag);
  if (!vs || !fs) return;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); return; }
  gl.useProgram(prog);

  // Fullscreen triangle
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = n => gl.getUniformLocation(prog, n);
  const uRes = U('uRes'), uTime = U('uTime'), uBreath = U('uBreath'), uAudio = U('uAudio');

  // Send one layer's settings to the shader
  function setLayer(prefix, L) {
    gl.uniform4f(U('u' + prefix + 'Geo'),  L.scale, L.warp, L.stretch, L.angle);
    gl.uniform4f(U('u' + prefix + 'Look'), L.negative, L.stain, L.detail, L.fiber);
    gl.uniform4f(U('u' + prefix + 'Misc'), L.accentStrength, L.shadow, L.rim, L.sheen);
    gl.uniform2f(U('u' + prefix + 'Seed'), L.seed[0], L.seed[1]);
    gl.uniform3fv(U('uPal' + prefix), new Float32Array(L.colors.flat()));
    gl.uniform3fv(U('uAcc' + prefix), new Float32Array(L.accents.flat()));
  }
  setLayer('A', CONFIG.layerA);
  setLayer('B', CONFIG.layerB);
  gl.uniform1f(U('uGrain'),   CONFIG.grain);
  gl.uniform1f(U('uOverlay'), CONFIG.overlay);
  gl.uniform1f(U('uBlur'),    CONFIG.blur);
  gl.uniform1f(U('uFrost'),   CONFIG.frost);
  gl.uniform1f(U('uMorph'),   CONFIG.audio.morph);

  function resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDPR);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    gl.uniform2f(uRes, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let visible = true, raf = 0, time = 0, breathTime = 0, last = performance.now();

  /* ---------------- Audio reactivity ---------------- */
  const A = CONFIG.audio;
  const audioEl = new Audio();
  audioEl.loop = true;
  // Only ask for CORS access when the track lives on another site. A file in the same folder
  // doesn't need it, and asking for it can stop the file loading at all.
  if (/^https?:\/\//i.test(A.src) && new URL(A.src, location.href).origin !== location.origin) {
    audioEl.crossOrigin = 'anonymous';
  }
  audioEl.volume = A.volume;

  let actx = null, analyser = null, freq = null, playing = false;
  const hi = [0, 0, 0, 0], lo = [1, 1, 1, 1];   // slow high / low envelope per band, so even a steady drone uses the full range
  const sm   = [0, 0, 0, 0];               // smoothed bass, mid, high, level

  function initAudio() {
    if (actx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC();
    const node = actx.createMediaElementSource(audioEl);
    analyser = actx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;
    node.connect(analyser);
    analyser.connect(actx.destination);
    freq = new Uint8Array(analyser.frequencyBinCount);
  }

  function bandAvg(from, to) {
    let s = 0;
    for (let i = from; i < to; i++) s += freq[i];
    return s / ((to - from) * 255);
  }

  function audioLevels(dt) {
    let raw = [0, 0, 0, 0];
    if (analyser && playing && !reduce) {
      analyser.getByteFrequencyData(freq);
      const b = bandAvg(1, 5), m = bandAvg(5, 40), h = bandAvg(40, 200);   // roughly 40-200 Hz, 200 Hz-1.7 kHz, 1.7-8.6 kHz
      raw = [b, m, h, (b + m + h) / 3];
    }
    const live = !!(analyser && playing && !reduce);
    for (let i = 0; i < 4; i++) {
      let target = 0;
      if (live) {
        // Where is this band right now between its recent low and recent high? (0..1)
        hi[i] = raw[i] > hi[i] ? raw[i] : hi[i] + (raw[i] - hi[i]) * (1 - Math.exp(-dt / 12));
        lo[i] = raw[i] < lo[i] ? raw[i] : lo[i] + (raw[i] - lo[i]) * (1 - Math.exp(-dt / 12));
        const span = Math.max(hi[i] - lo[i], 0.04);
        target = Math.pow(Math.min(Math.max((raw[i] - lo[i]) / span, 0), 1), 1.2) * A.amount;
      }
      const tau = target > sm[i] ? A.attack : A.release;
      sm[i] += (target - sm[i]) * (1 - Math.exp(-dt / Math.max(tau, 0.01)));
    }
    return sm;
  }

  /* ---------------- Audio controls (small pill, bottom-left) ---------------- */
  const ui = document.createElement('div');
  ui.className = 'eth-audio';
  ui.innerHTML =
    '<button type="button" class="eth-audio__pick">Choose track</button>' +
    '<button type="button" class="eth-audio__play" aria-label="Play" hidden>Play</button>' +
    '<input class="eth-audio__vol" type="range" min="0" max="1" step="0.01" aria-label="Volume" hidden>' +
    '<span class="eth-audio__meter" hidden title="Bass / mids / highs"><i></i><i></i><i></i></span>' +
    '<span class="eth-audio__name" hidden></span>' +
    '<input class="eth-audio__file" type="file" accept="audio/*" hidden>';
  document.body.appendChild(ui);

  const $ = s => ui.querySelector(s);
  const pickBtn = $('.eth-audio__pick'), playBtn = $('.eth-audio__play'),
        vol = $('.eth-audio__vol'), nameEl = $('.eth-audio__name'), fileIn = $('.eth-audio__file'),
        meter = $('.eth-audio__meter'), meterBars = ui.querySelectorAll('.eth-audio__meter i');
  vol.value = A.volume;

  function setPlaying(on) {
    playing = on;
    playBtn.textContent = on ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
  }

  function showControls(label) {
    nameEl.removeAttribute('style');
    nameEl.removeAttribute('title');
    nameEl.textContent = label;
    nameEl.hidden = false; playBtn.hidden = false; vol.hidden = false; meter.hidden = false;
    pickBtn.textContent = 'Change';
  }

  // Visible status message, so a problem never fails silently
  function note(msg) {
    nameEl.textContent = msg;
    nameEl.title = msg;
    nameEl.hidden = false;
    nameEl.style.maxWidth = '280px';
    nameEl.style.whiteSpace = 'normal';
    nameEl.style.opacity = '1';
  }

  audioEl.addEventListener('error', () => {
    setPlaying(false);
    const file = (A.src || '').split('/').pop();
    note("Can't load " + (file || 'that track') + ". Check the file name and that it sits next to index.html, or use Change.");
  });

  async function startPlayback() {
    initAudio();
    if (!actx) return;
    try { await actx.resume(); await audioEl.play(); setPlaying(true); }
    catch (e) { console.warn(e); setPlaying(false); }
  }

  pickBtn.addEventListener('click', () => fileIn.click());
  fileIn.addEventListener('change', () => {
    const f = fileIn.files[0];
    if (!f) return;
    audioEl.src = URL.createObjectURL(f);
    showControls(f.name.replace(/\.[^.]+$/, ''));
    startPlayback();
  });
  playBtn.addEventListener('click', () => {
    if (playing) { audioEl.pause(); setPlaying(false); }
    else startPlayback();
  });
  vol.addEventListener('input', () => { audioEl.volume = +vol.value; });

  if (A.src && location.protocol === 'file:') {
    // Browsers block or silence audio analysis for files opened straight from disk
    console.warn('Preloaded audio needs http(s): run a local server, or use the Choose track button.');
    note('Preloading needs a local server. Use Choose track instead.');
  } else if (A.src) {   // preloaded track: visitor presses Play (autoplay is blocked by browsers)
    audioEl.src = A.src;
    showControls(A.src.split('/').pop().replace(/\.[^.]+$/, ''));
  }

  function frame(now){
    raf = requestAnimationFrame(frame);
    if (!visible) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const lv = audioLevels(dt);
    // the music adds its own flow on top of the slow base drift
    if (!reduce) { time += dt * (CONFIG.speed * 10 + A.flow * lv[3]); breathTime += dt * CONFIG.breath; }
    gl.uniform1f(uTime, time);
    gl.uniform1f(uBreath, breathTime);
    gl.uniform4f(uAudio, lv[0], lv[1], lv[2], lv[3]);
    for (let i = 0; i < 3; i++) meterBars[i].style.transform = 'scaleY(' + (0.08 + 0.92 * lv[i]) + ')';
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  raf = requestAnimationFrame(frame);

  // Pause when off-screen or tab hidden (saves battery)
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else { last = performance.now(); raf = requestAnimationFrame(frame); }
  });
})();
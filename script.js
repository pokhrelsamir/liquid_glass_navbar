(function () {
  'use strict';

  const STORAGE_KEY = 'lg_demo_config_v2';
  const DEFAULT_CONFIG = {
    glassThickness: 80,
    bezelWidth: 40,
    ior: 1.4,
    scaleRatio: 1.0,
    blur: 1,
    specularOpacity: 0.6,
    specularSat: 0,
    tintColor: '255,255,255',
    tintOpacity: 0,
    innerShadow: 'rgba(255,255,255,0)',
    innerShadowBlur: 0,
    innerShadowSpread: 0,
    balancedSpecular: false
  };
  const DEFAULT_SWITCHER_CONFIG = {
    glassThickness: 30,
    bezelWidth: 40,
    ior: 1.4,
    scaleRatio: 1.0,
    blur: 0,
    specularOpacity: 0.5,
    specularSat: 0,
    tintColor: '255,255,255',
    tintOpacity: 0,
    innerShadow: 'rgba(255,255,255,0)',
    innerShadowBlur: 0,
    innerShadowSpread: 0,
    balancedSpecular: true
  };

  let config = deepClone(DEFAULT_CONFIG);
  let switcherConfig = deepClone(DEFAULT_SWITCHER_CONFIG);
  const targets = new Map();
  let defs = null;

  function deepClone(v) { return JSON.parse(JSON.stringify(v)); }
  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
  function num(v, d, min, max) {
    const raw = typeof v === 'string' ? v.replace(',', '.') : v;
    const n = Number(raw);
    if (!Number.isFinite(n)) return d;
    return clamp(n, min, max);
  }

  function sanitize(raw, defaults = DEFAULT_CONFIG) {
    const x = raw && typeof raw === 'object' ? raw : {};
    return {
      glassThickness: num(x.glassThickness, defaults.glassThickness, 0, 400),
      bezelWidth: num(x.bezelWidth, defaults.bezelWidth, 0, 400),
      ior: num(x.ior, defaults.ior, 1, 8),
      scaleRatio: num(x.scaleRatio, defaults.scaleRatio, 0, 10),
      blur: num(x.blur, defaults.blur, 0, 30),
      specularOpacity: num(x.specularOpacity, defaults.specularOpacity, 0, 3),
      specularSat: num(x.specularSat, defaults.specularSat, 0, 3),
      tintColor: typeof x.tintColor === 'string' ? x.tintColor : defaults.tintColor,
      tintOpacity: num(x.tintOpacity, defaults.tintOpacity, 0, 1),
      innerShadow: typeof x.innerShadow === 'string' ? x.innerShadow : defaults.innerShadow,
      innerShadowBlur: num(x.innerShadowBlur, defaults.innerShadowBlur, 0, 300),
      innerShadowSpread: num(x.innerShadowSpread, defaults.innerShadowSpread, -300, 300),
      balancedSpecular: typeof x.balancedSpecular === 'boolean' ? x.balancedSpecular : !!defaults.balancedSpecular
    };
  }

  function saveConfig() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ config, switcherConfig }));
  }
  function loadConfigBundle() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (!v) {
        config = deepClone(DEFAULT_CONFIG);
        switcherConfig = deepClone(DEFAULT_SWITCHER_CONFIG);
        return;
      }
      const parsed = JSON.parse(v);
      if (parsed && parsed.config) {
        config = sanitize(parsed.config, DEFAULT_CONFIG);
        switcherConfig = sanitize(parsed.switcherConfig || parsed.config, DEFAULT_SWITCHER_CONFIG);
      } else {
        config = sanitize(parsed, DEFAULT_CONFIG);
        switcherConfig = deepClone(DEFAULT_SWITCHER_CONFIG);
      }
    } catch (_) {
      config = deepClone(DEFAULT_CONFIG);
      switcherConfig = deepClone(DEFAULT_SWITCHER_CONFIG);
    }
  }

  function setStatus(text) {
    const n = document.getElementById('statusText');
    if (!n) return;
    n.textContent = text;
    clearTimeout(n.__t);
    n.__t = setTimeout(() => { n.textContent = ''; }, 1100);
  }

  function surfaceFn(x) {
    return Math.pow(1 - Math.pow(1 - x, 4), 0.25);
  }

  function calcRefractionProfile(glassThickness, bezelWidth, ior, samples) {
    samples = samples || 128;
    const eta = 1 / ior;
    function refract(nx, ny) {
      const dot = ny;
      const k = 1 - eta * eta * (1 - dot * dot);
      if (k < 0) return null;
      const sq = Math.sqrt(k);
      return [-(eta * dot + sq) * nx, eta - (eta * dot + sq) * ny];
    }
    const p = new Float64Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = i / samples;
      const y = surfaceFn(x);
      const dx = x < 1 ? 0.0001 : -0.0001;
      const y2 = surfaceFn(x + dx);
      const deriv = (y2 - y) / dx;
      const mag = Math.sqrt(deriv * deriv + 1);
      const ref = refract(-deriv / mag, -1 / mag);
      p[i] = ref ? ref[0] * ((y * bezelWidth + glassThickness) / ref[1]) : 0;
    }
    return p;
  }

  function generateDisplacementMap(w, h, radius, bezelWidth, profile, maxDisp) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = 128; d[i + 1] = 128; d[i + 2] = 0; d[i + 3] = 255; }
    const r = radius, rSq = r * r, r1Sq = (r + 1) ** 2;
    const rBSq = Math.max(r - bezelWidth, 0) ** 2;
    const wB = w - r * 2, hB = h - r * 2, S = profile.length;
    for (let y1 = 0; y1 < h; y1++) {
      for (let x1 = 0; x1 < w; x1++) {
        const x = x1 < r ? x1 - r : x1 >= w - r ? x1 - r - wB : 0;
        const y = y1 < r ? y1 - r : y1 >= h - r ? y1 - r - hB : 0;
        const dSq = x * x + y * y;
        if (dSq > r1Sq || dSq < rBSq) continue;
        const dist = Math.sqrt(dSq);
        const fromSide = r - dist;
        const op = dSq < rSq ? 1 : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
        if (op <= 0 || dist === 0) continue;
        const cos = x / dist, sin = y / dist;
        const bi = Math.min(((fromSide / bezelWidth) * S) | 0, S - 1);
        const disp = profile[bi] || 0;
        const dX = (-cos * disp) / maxDisp, dY = (-sin * disp) / maxDisp;
        const idx = (y1 * w + x1) * 4;
        d[idx] = (128 + dX * 127 * op + 0.5) | 0;
        d[idx + 1] = (128 + dY * 127 * op + 0.5) | 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  function generateSpecularMap(w, h, radius, bezelWidth, balanced) {
    const angle = Math.PI / 3;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data; d.fill(0);
    const r = radius, rSq = r * r, r1Sq = (r + 1) ** 2;
    const rBSq = Math.max(r - bezelWidth, 0) ** 2;
    const wB = w - r * 2, hB = h - r * 2;
    const sv = [Math.cos(angle), Math.sin(angle)];
    for (let y1 = 0; y1 < h; y1++) {
      for (let x1 = 0; x1 < w; x1++) {
        const x = x1 < r ? x1 - r : x1 >= w - r ? x1 - r - wB : 0;
        const y = y1 < r ? y1 - r : y1 >= h - r ? y1 - r - hB : 0;
        const dSq = x * x + y * y;
        if (dSq > r1Sq || dSq < rBSq) continue;
        const dist = Math.sqrt(dSq);
        const fromSide = r - dist;
        const op = dSq < rSq ? 1 : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
        if (op <= 0 || dist === 0) continue;
        const cos = x / dist, sin = -y / dist;
        const dot = balanced ? 1 : Math.abs(cos * sv[0] + sin * sv[1]);
        const edge = Math.sqrt(Math.max(0, 1 - (1 - fromSide) ** 2));
        const coeff = dot * edge;
        const col = (255 * coeff) | 0;
        const alpha = (col * coeff * op) | 0;
        const idx = (y1 * w + x1) * 4;
        d[idx] = col; d[idx + 1] = col; d[idx + 2] = col; d[idx + 3] = alpha;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  function ensureDefs() {
    const old = document.getElementById('demo-lg-defs');
    if (old && document.documentElement.contains(old)) {
      defs = old;
      return;
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;z-index:-1;';
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.id = 'demo-lg-defs';
    svg.appendChild(defs);
    document.documentElement.appendChild(svg);
  }

  function buildFilter(id, w, h, radius, cfg) {
    const bezel = Math.min(cfg.bezelWidth, radius - 1, Math.min(w, h) / 2 - 1);
    const profile = calcRefractionProfile(cfg.glassThickness, bezel, cfg.ior, 128);
    const maxDisp = Math.max(...Array.from(profile).map(Math.abs)) || 1;
    const dispUrl = generateDisplacementMap(w, h, radius, bezel, profile, maxDisp);
    const specUrl = generateSpecularMap(w, h, radius, bezel * 2.5, !!cfg.balancedSpecular);
    const scale = maxDisp * cfg.scaleRatio;
    const pad = cfg.balancedSpecular ? 0.36 : 0;
    const fx = Math.round(-w * pad);
    const fy = Math.round(-h * pad);
    const fw = Math.round(w * (1 + pad * 2));
    const fh = Math.round(h * (1 + pad * 2));

    const filter = svgEl('filter', {
      id,
      x: String(fx),
      y: String(fy),
      width: String(fw),
      height: String(fh),
      filterUnits: 'userSpaceOnUse',
      primitiveUnits: 'userSpaceOnUse',
      'color-interpolation-filters': 'sRGB'
    });
    const blur = svgEl('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: cfg.blur, result: 'blurred' });
    const dispImg = svgEl('feImage', { href: dispUrl, x: 0, y: 0, width: w, height: h, result: 'disp_map' });
    const dispMap = svgEl('feDisplacementMap', {
      in: 'blurred',
      in2: 'disp_map',
      scale,
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      result: 'displaced'
    });
    const sat = svgEl('feColorMatrix', { in: 'displaced', type: 'saturate', values: cfg.specularSat, result: 'displaced_sat' });
    const spec = svgEl('feImage', { href: specUrl, x: 0, y: 0, width: w, height: h, result: 'spec_layer' });
    const comp = svgEl('feComposite', { in: 'displaced_sat', in2: 'spec_layer', operator: 'in', result: 'spec_masked' });
    const tr = svgEl('feComponentTransfer', { in: 'spec_layer', result: 'spec_faded' });
    tr.appendChild(svgEl('feFuncA', { type: 'linear', slope: cfg.specularOpacity }));
    const b1 = svgEl('feBlend', { in: 'spec_masked', in2: 'displaced', mode: 'normal', result: 'with_sat' });
    const b2 = svgEl('feBlend', { in: 'spec_faded', in2: 'with_sat', mode: 'normal' });
    filter.append(blur, dispImg, dispMap, sat, spec, comp, tr, b1, b2);
    return filter;
  }

  function applyGlass(el, cfgGetter) {
    if (targets.has(el)) return;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';

    const refr = document.createElement('div');
    refr.className = 'lg-layer';
    refr.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none;';
    const tint = document.createElement('div');
    tint.className = 'lg-layer';
    tint.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none;';
    el.insertBefore(tint, el.firstChild);
    el.insertBefore(refr, el.firstChild);

    let filterNode = null;
    let timer = null;
    function elevate() {
      Array.from(el.children).forEach((c) => {
        if (c === refr || c === tint) return;
        if (getComputedStyle(c).position === 'static') c.style.position = 'relative';
        if (!c.style.zIndex) c.style.zIndex = '1';
      });
    }
    function rebuild() {
      ensureDefs();
      const rect = el.getBoundingClientRect();
      const w = Math.round(el.offsetWidth || rect.width);
      const h = Math.round(el.offsetHeight || rect.height);
      if (w < 4 || h < 4) return;
      const dataR = parseFloat(el.getAttribute('data-radius') || '0');
      const cssR = parseFloat(getComputedStyle(el).borderTopLeftRadius || '0');
      const r = Math.max(2, Math.min(dataR || cssR || 24, w / 2, h / 2));
      if (filterNode) filterNode.remove();
      const cfg = cfgGetter();
      const id = 'demo-lg-' + Math.random().toString(36).slice(2, 10);
      filterNode = buildFilter(id, w, h, r, cfg);
      defs.appendChild(filterNode);
      refr.style.borderRadius = r + 'px';
      refr.style.backdropFilter = `url(#${id})`;
      refr.style.webkitBackdropFilter = `url(#${id})`;
      tint.style.borderRadius = r + 'px';
      tint.style.backgroundColor = `rgba(${cfg.tintColor},${cfg.tintOpacity})`;
      tint.style.boxShadow = `inset 0 0 ${cfg.innerShadowBlur}px ${cfg.innerShadowSpread}px ${cfg.innerShadow}`;
      elevate();
    }
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(rebuild, 16);
    }

    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    targets.set(el, {
      rebuild,
      destroy() {
        clearTimeout(timer);
        ro.disconnect();
        if (filterNode) filterNode.remove();
        refr.remove();
        tint.remove();
      }
    });
    rebuild();
  }

  function removeGlass(el) {
    const inst = targets.get(el);
    if (!inst) return;
    inst.destroy();
    targets.delete(el);
  }

  function enableGlass(el, cfgGetter) {
    if (!targets.has(el)) applyGlass(el, cfgGetter);
    else targets.get(el).rebuild();
  }

  function rebuildAll() {
    targets.forEach((inst) => inst.rebuild());
  }

  function bindConfigPanel() {
    const fields = [
      'glassThickness',
      'bezelWidth',
      'ior',
      'scaleRatio',
      'blur',
      'specularOpacity',
      'specularSat',
      'tintColor',
      'tintOpacity',
      'innerShadow',
      'innerShadowBlur',
      'innerShadowSpread'
    ];
    const swFields = fields.slice();

    fields.forEach((k) => {
      const input = document.getElementById('cfg-' + k);
      if (!input) return;
      input.value = String(config[k]);
      input.addEventListener('input', () => {
        config[k] = input.type === 'number' ? Number(input.value) : input.value;
        config = sanitize(config, DEFAULT_CONFIG);
        rebuildAll();
      });
    });
    swFields.forEach((k) => {
      const input = document.getElementById('sw-' + k);
      if (!input) return;
      input.value = String(switcherConfig[k]);
      input.addEventListener('input', () => {
        switcherConfig[k] = input.type === 'number' ? Number(input.value) : input.value;
        switcherConfig = sanitize(switcherConfig, DEFAULT_SWITCHER_CONFIG);
        rebuildAll();
      });
    });

    document.getElementById('saveBtn').addEventListener('click', () => {
      saveConfig();
      setStatus('saved');
    });
    document.getElementById('resetBtn').addEventListener('click', () => {
      config = deepClone(DEFAULT_CONFIG);
      switcherConfig = deepClone(DEFAULT_SWITCHER_CONFIG);
      fields.forEach((k) => {
        const input = document.getElementById('cfg-' + k);
        if (input) input.value = String(config[k]);
      });
      swFields.forEach((k) => {
        const input = document.getElementById('sw-' + k);
        if (input) input.value = String(switcherConfig[k]);
      });
      rebuildAll();
      setStatus('reset');
    });
    document.getElementById('rebuildBtn').addEventListener('click', () => {
      rebuildAll();
      setStatus('rebuilt');
    });
  }

  function bindNavSwitcher() {
    const nav = document.querySelector('.ios26-nav-inner');
    const navWrap = document.querySelector('.ios26-nav');
    if (!nav) return;
    const glow = document.getElementById('navGlow');
    const indicator = document.getElementById('tabIndicator');
    const items = Array.from(nav.querySelectorAll('.ios-item'));
    if (!nav || !navWrap || !glow || !indicator || !items.length) return;

    const DRAG_THRESHOLD = 6;
    const OVERSHOOT = 22;

    let active = Math.max(0, items.findIndex((x) => x.classList.contains('active')));
    let targetIndex = active;
    let pointerId = null;
    let pressX = 0;
    let pressY = 0;
    let dragMode = false;
    let pressWidth = 0;
    let finishTimer = null;
    let glassRebuildQueued = false;

    function navRect() {
      return nav.getBoundingClientRect();
    }

    function toLocalX(clientX) {
      const nr = navRect();
      const sx = nr.width > 0 ? nav.clientWidth / nr.width : 1;
      return (clientX - nr.left) * sx;
    }

    function itemMetrics(i) {
      const nr = navRect();
      const ir = items[i].getBoundingClientRect();
      const sx = nr.width > 0 ? nav.clientWidth / nr.width : 1;
      const left = (ir.left - nr.left) * sx;
      const width = ir.width * sx;
      return { left, width, center: left + width / 2 };
    }

    function nearestIndex(localX) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < items.length; i++) {
        const d = Math.abs(localX - itemMetrics(i).center);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    }

    function setActive(i) {
      active = i;
      items.forEach((btn, idx) => btn.classList.toggle('active', idx === i));
    }

    function setIndicator(left, width, animate) {
      if (!animate) {
        const old = indicator.style.transition;
        indicator.style.transition = 'none';
        indicator.style.left = `${left}px`;
        indicator.style.width = `${width}px`;
        indicator.offsetWidth;
        indicator.style.transition = old;
        return;
      }
      indicator.style.left = `${left}px`;
      indicator.style.width = `${width}px`;
    }

    function snapToIndex(i, animate) {
      const m = itemMetrics(i);
      setIndicator(m.left, m.width, animate);
    }

    function setGlow(clientX, clientY, alpha) {
      const nr = navRect();
      const lx = toLocalX(clientX);
      nav.style.setProperty('--gx', `${lx}px`);
      nav.style.setProperty('--gy', `${clientY - nr.top}px`);
      nav.style.setProperty('--ga', String(alpha));
    }

    function forceGlassRebuild() {
      const inst = targets.get(indicator);
      if (inst) inst.rebuild();
    }

    function queueGlassRebuild() {
      if (glassRebuildQueued) return;
      glassRebuildQueued = true;
      requestAnimationFrame(() => {
        glassRebuildQueued = false;
        forceGlassRebuild();
      });
    }

    function beginInteraction(clientX, clientY) {
      clearTimeout(finishTimer);
      indicator.classList.add('interacting');
      navWrap.classList.add('engaged');
      setGlow(clientX, clientY, 0.24);
      enableGlass(indicator, () => ({ ...switcherConfig, balancedSpecular: true }));
      queueGlassRebuild();
    }

    function endInteraction() {
      clearTimeout(finishTimer);
      finishTimer = setTimeout(() => {
        indicator.classList.remove('interacting');
        nav.classList.remove('dragging');
        navWrap.classList.remove('engaged');
        nav.style.setProperty('--ga', '0');
        removeGlass(indicator);
      }, 500);
    }

    function dragMove(clientX) {
      const localX = toLocalX(clientX);
      const w = pressWidth || itemMetrics(active).width;
      let left = localX - w / 2;
      left = clamp(left, -OVERSHOOT, nav.clientWidth - w + OVERSHOOT);
      indicator.style.left = `${left}px`;
      indicator.style.width = `${w}px`;
      targetIndex = nearestIndex(localX);
      queueGlassRebuild();
    }

    function clearPointerHandlers() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    }

    function finishSelection() {
      nav.classList.remove('dragging');
      setActive(targetIndex);
      snapToIndex(targetIndex, true);
      queueGlassRebuild();
      setTimeout(queueGlassRebuild, 120);
      endInteraction();
    }

    function onPointerMove(e) {
      if (e.pointerId !== pointerId) return;
      const dx = Math.abs(e.clientX - pressX);
      const dy = Math.abs(e.clientY - pressY);
      if (!dragMode && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
        dragMode = true;
        nav.classList.add('dragging');
      }

      if (dragMode) {
        setGlow(e.clientX, e.clientY, 0.18);
        dragMove(e.clientX);
      } else {
        setGlow(e.clientX, e.clientY, 0.22);
      }
    }

    function onPointerUp(e) {
      if (e.pointerId !== pointerId) return;
      clearPointerHandlers();
      finishSelection();
      pointerId = null;
      dragMode = false;
    }

    function onPointerCancel(e) {
      if (e.pointerId !== pointerId) return;
      clearPointerHandlers();
      nav.classList.remove('dragging');
      snapToIndex(active, true);
      endInteraction();
      pointerId = null;
      dragMode = false;
    }

    function armPointer(idx, e) {
      if (pointerId !== null) return;
      pointerId = e.pointerId;
      dragMode = false;
      targetIndex = idx;
      pressX = e.clientX;
      pressY = e.clientY;
      pressWidth = itemMetrics(idx).width;

      beginInteraction(e.clientX, e.clientY);

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);
    }

    items.forEach((btn, idx) => {
      btn.style.touchAction = 'none';
      btn.addEventListener('pointerdown', (e) => {
        if (!e.isPrimary || e.button !== 0) return;
        e.preventDefault();
        armPointer(idx, e);
      });
    });

    snapToIndex(active, false);
    window.addEventListener('resize', () => snapToIndex(active, false));
  }

  function makeDraggable(el) {
    if (!el) return;
    let dragging = false;
    let ox = 0;
    let oy = 0;

    function onMove(e) {
      if (!dragging) return;
      const x = e.clientX - ox;
      const y = e.clientY - oy;
      const maxX = window.innerWidth - el.offsetWidth;
      const maxY = window.innerHeight - el.offsetHeight;
      el.style.left = clamp(x, 0, Math.max(0, maxX)) + 'px';
      el.style.top = clamp(y, 0, Math.max(0, maxY)) + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      const r = el.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      el.classList.add('dragging');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function bindThemeCard() {
    const THEME_KEY = 'lg_demo_theme_v1';
    const WIFI_KEY = 'lg_demo_wifi_v1';
    const lightBtn = document.getElementById('light-btn');
    const darkBtn = document.getElementById('dark-btn');
    const wifiSwitch = document.getElementById('wifi-switch');
    const wifiRow = document.getElementById('wifi-row');
    if (!lightBtn || !darkBtn) return;

    function applyTheme(theme) {
      const dark = theme === 'dark';
      document.body.classList.toggle('dark-theme', dark);
      document.body.classList.toggle('light-theme', !dark);
      lightBtn.classList.toggle('active', !dark);
      darkBtn.classList.toggle('active', dark);
      setTimeout(rebuildAll, 40);
    }

    function setTheme(theme) {
      const normalized = theme === 'dark' ? 'dark' : 'light';
      applyTheme(normalized);
      localStorage.setItem(THEME_KEY, normalized);
    }

    setTheme(localStorage.getItem(THEME_KEY) || 'light');

    lightBtn.addEventListener('click', () => setTheme('light'));
    darkBtn.addEventListener('click', () => setTheme('dark'));

    if (!wifiSwitch || !wifiRow) return;
    let wifiOn = localStorage.getItem(WIFI_KEY) !== 'off';

    function applyWifiState() {
      wifiSwitch.classList.toggle('active', wifiOn);
      wifiRow.classList.toggle('wifi-on', wifiOn);
    }

    applyWifiState();

    wifiSwitch.addEventListener('click', () => {
      wifiOn = !wifiOn;
      applyWifiState();
      localStorage.setItem(WIFI_KEY, wifiOn ? 'on' : 'off');
    });
  }

  function init() {
    loadConfigBundle();
    ensureDefs();
    document.querySelectorAll('.lg-demo-target').forEach((el) => applyGlass(el, () => config));
    bindNavSwitcher();
    bindConfigPanel();
    bindThemeCard();
    makeDraggable(document.getElementById('glassCircle'));
    makeDraggable(document.getElementById('glassSquare'));
    window.addEventListener('resize', rebuildAll);
    setStatus('ready');
  }

  init();
})();

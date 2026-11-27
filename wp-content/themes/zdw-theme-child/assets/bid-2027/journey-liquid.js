/**
 * ZDW 2027 AE Liquid background for "Cesta soutěží / Competition Journey",
 * powered by the ZDW-liquid painted-area engine (commit 6de4877) driven by
 * independent editable source points with adjustable perimeters.
 *
 * Interactive Point & Perimeter editor (Shift+L or ?liquid-debug=1):
 * - Drag numbered center nodes to reposition each liquid source on the page
 * - Drag any perimeter ring (or its rim handle) to resize its radius live
 * - Add/delete points, adjust structure/cavities, toggle text avoidance
 * - Auto-saves drafts to localStorage + Copy JSON button for baking final layout
 */
(function () {
	'use strict';

	var config = window.zdwBidLiquid;
	if (!config || !config.mapUrl) {
		return;
	}

	if (typeof window.DecompressionStream !== 'function' || typeof window.fetch !== 'function') {
		return;
	}

	var isLandingProfile = config.profile === 'landing';
	var STORAGE_KEY = isLandingProfile ? 'zdw_bid_landing_liquid_v1' : 'zdw_bid_liquid_points_v2';
	var DISABLED_STORAGE_KEY = isLandingProfile ? 'zdw_bid_landing_liquid_disabled_v1' : 'zdw_bid_liquid_disabled_v1';
	var FLIP_STORAGE_KEY = 'zdw_bid_journey_flip_v1';
	var PALETTE_VERSION = 2;
	var DEFAULT_SEED = 'seed';
	var MAX_POINTS = 16;
	var MAX_TEXT_BOXES = 12;
	var PALETTE_COUNT = 7;
	var MAP_WIDTH = 960;
	var MAP_HEIGHT = 540;
	var PAD_AE = 220;
	var MAX_WORK_W = 2480;
	var MAX_WORK_H = 1880;
	var WAVE_SPEED = 0.22;
	var WAVE_PERIOD = 1 / WAVE_SPEED;
	var AMBIENT_SPEED = 0.16;
	var SCROLL_PHASE_PER_PX = 0.0014;
	var IDLE_FRAME_MS = 1000 / 30;
	var STATIC_TIME = 1.45;
	var SVG_NS = 'http://www.w3.org/2000/svg';

	// Default 7-stop palette for Journey: Figma smoky Nebesky modrá reference
	// (constant Figma blue hue ~223° from charcoal-slate knots up to #9fbaff).
	var FIGMA_SMOKE_COLORS = [
		'#25272c',
		'#3b404d',
		'#576380',
		'#7385b3',
		'#8aa1dc',
		'#99b3f5',
		'#9fbaff'
	];

	var FIGMA_SMOKE_ALPHAS = [0.85, 0.80, 0.86, 0.92, 0.96, 1, 1];

	// Default 7-stop palette for BiD Landing light panels (#EBEBEB):
	// matched to Figma light-panel misty silver-periwinkle reference (~223° hue, soft contrast).
	var FIGMA_LIGHT_MIST_COLORS = [
		'#7d8089',
		'#9ea3b0',
		'#b1b9ce',
		'#bcc6e0',
		'#c7d2ed',
		'#d7dce8',
		'#e4e6ec'
	];

	var FIGMA_LIGHT_MIST_ALPHAS = [0.78, 0.74, 0.78, 0.82, 0.76, 0.58, 0.28];

	var PROFILE_DEFAULT_COLORS = isLandingProfile ? FIGMA_LIGHT_MIST_COLORS : FIGMA_SMOKE_COLORS;
	var PROFILE_DEFAULT_ALPHAS = isLandingProfile ? FIGMA_LIGHT_MIST_ALPHAS : FIGMA_SMOKE_ALPHAS;
	var DEFAULT_OPACITY = isLandingProfile ? 0.85 : 0.9;

	var BLUE_LIGHT_COLORS = [
		'#9fbaff',
		'#9fbaff',
		'#b4c9ff',
		'#cad9ff',
		'#dfe8ff',
		'#f2f6ff',
		'#ffffff'
	];

	var DEFAULT_ALPHAS = [1, 1, 1, 1, 1, 1, 1];

	var PALETTE_PRESETS = [
		{
			id: 'figma-light-mist',
			label: 'Figma mlha (světlá)',
			colors: FIGMA_LIGHT_MIST_COLORS,
			alphas: FIGMA_LIGHT_MIST_ALPHAS,
			opacity: 0.85
		},
		{
			id: 'figma-smoke',
			label: 'Figma modrá',
			colors: FIGMA_SMOKE_COLORS,
			alphas: FIGMA_SMOKE_ALPHAS,
			opacity: 0.9
		},
		{
			id: 'blue-light',
			label: 'Modrá → světlo',
			colors: BLUE_LIGHT_COLORS,
			alphas: DEFAULT_ALPHAS,
			opacity: 1
		},
		{
			id: 'blue-fade',
			label: 'Do ztracena (α)',
			colors: BLUE_LIGHT_COLORS,
			alphas: [0, 0.18, 0.42, 0.65, 0.82, 0.94, 1],
			opacity: 1
		},
		{
			id: 'zdw-original',
			label: 'Původní ZDW',
			colors: ['#fd3d62', '#fb8656', '#f8cf49', '#d2c897', '#9fbaff', '#cfb2f7', '#ffa9ef'],
			alphas: DEFAULT_ALPHAS,
			opacity: 1
		}
	];

	// Quick palette swatches following Liquid Studio's palette principle:
	var PALETTE_SWATCHES = isLandingProfile
		? [
				{ hex: '#7d8089', name: 'Grafitový stín (Figma)' },
				{ hex: '#9ea3b0', name: 'Stříbrná mlha (Figma)' },
				{ hex: '#b1b9ce', name: 'Modrošedá (Figma)' },
				{ hex: '#bcc6e0', name: 'Světlá mlha (Figma)' },
				{ hex: '#9fbaff', name: 'Nebesky modrá (Figma)' },
				{ hex: '#ebebeb', name: 'Holu-bičí šeď (Figma)' },
				{ hex: '#1f1f1f', name: 'Ne-černá (Figma)' },
				{ hex: '#ffffff', name: 'Bílá (Figma)' },
				{ hex: '#16533f', name: 'Tmavě zelená (Figma)' },
				{ hex: '#f8cf49', name: 'Slunečnicově žlutá (Figma)' },
				{ hex: '#fd3d62', name: 'Malinově červená (Figma)' },
				{ hex: '#ffa9ef', name: 'Růžová (Figma)' }
			]
		: [
				{ hex: '#1f1f1f', name: 'Ne-černá (Figma)' },
				{ hex: '#3b404d', name: 'Tmavý kouř (Figma)' },
				{ hex: '#576380', name: 'Ocelová modrá (Figma)' },
				{ hex: '#7385b3', name: 'Tlumená modrá (Figma)' },
				{ hex: '#9fbaff', name: 'Nebesky modrá (Figma)' },
				{ hex: '#ffffff', name: 'Bílá / světlo (Figma)' },
				{ hex: '#dfe8ff', name: 'Ledová modrá' },
				{ hex: '#ebebeb', name: 'Holu-bičí šeď (Figma)' },
				{ hex: '#16533f', name: 'Tmavě zelená (Figma)' },
				{ hex: '#f8cf49', name: 'Slunečnicově žlutá (Figma)' },
				{ hex: '#fd3d62', name: 'Malinově červená (Figma)' },
				{ hex: '#ffa9ef', name: 'Růžová (Figma)' }
			];

	var ROW_MINI_SWATCHES = PALETTE_SWATCHES.slice(0, 6);

	function normalizeSeed(value) {
		if (typeof value !== 'string') {
			return DEFAULT_SEED;
		}
		var trimmed = value.trim().slice(0, 64);
		return trimmed || DEFAULT_SEED;
	}

	function hashSeedString(seedStr) {
		var str = normalizeSeed(seedStr);
		var h = 2166136261;
		for (var i = 0; i < str.length; i++) {
			h ^= str.charCodeAt(i);
			h = Math.imul(h, 16777619);
		}
		return h >>> 0;
	}

	function computeSeedParams(seedStr) {
		var a = hashSeedString(seedStr);
		function next() {
			a = (a + 0x6d2b79f5) >>> 0;
			var t = Math.imul(a ^ (a >>> 15), 1 | a);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		}
		return {
			geo: new Float32Array([
				(next() - 0.5) * 960,
				(next() - 0.5) * 960,
				(next() - 0.5) * 12,
				(next() - 0.5) * 12
			]),
			disp: new Float32Array([
				(next() - 0.5) * 1080,
				(next() - 0.5) * 1080,
				(next() - 0.5) * 60,
				(next() - 0.5) * 60
			]),
			angleOffset: next() * Math.PI * 2,
			waveOffset: next() * 485
		};
	}

	function normalizeHex(value, fallback) {
		if (typeof value === 'string') {
			var trimmed = value.trim().toLowerCase();
			if (/^#[0-9a-f]{6}$/.test(trimmed)) {
				return trimmed;
			}
			if (/^[0-9a-f]{6}$/.test(trimmed)) {
				return '#' + trimmed;
			}
		}
		return fallback;
	}

	function normalizeColors(colors) {
		var result = [];
		for (var i = 0; i < PALETTE_COUNT; i++) {
			var raw = Array.isArray(colors) ? colors[i] : null;
			result.push(normalizeHex(raw, PROFILE_DEFAULT_COLORS[i]));
		}
		return result;
	}

	function normalizeAlpha(value, fallback) {
		var num = typeof value === 'number' ? value : Number(value);
		if (!isFinite(num)) {
			return fallback;
		}
		return Math.max(0, Math.min(1, num));
	}

	function normalizeAlphas(alphas) {
		var result = [];
		for (var i = 0; i < PALETTE_COUNT; i++) {
			var raw = Array.isArray(alphas) ? alphas[i] : null;
			result.push(raw === null || raw === undefined ? PROFILE_DEFAULT_ALPHAS[i] : normalizeAlpha(raw, PROFILE_DEFAULT_ALPHAS[i]));
		}
		return result;
	}

	function parseHexWithOptionalAlpha(value) {
		if (typeof value !== 'string') {
			return null;
		}
		var trimmed = value.trim().toLowerCase().replace(/^#/, '');
		if (/^[0-9a-f]{6}$/.test(trimmed)) {
			return { hex: '#' + trimmed, alpha: null };
		}
		if (/^[0-9a-f]{8}$/.test(trimmed)) {
			return {
				hex: '#' + trimmed.slice(0, 6),
				alpha: Math.round((parseInt(trimmed.slice(6, 8), 16) / 255) * 100) / 100
			};
		}
		return null;
	}

	function hexToRgbaCss(hex, alpha) {
		var clean = normalizeHex(hex, '#9fbaff');
		var val = parseInt(clean.slice(1), 16);
		var r = (val >> 16) & 255;
		var g = (val >> 8) & 255;
		var b = val & 255;
		return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + normalizeAlpha(alpha, 1).toFixed(3) + ')';
	}

	function colorsMatch(a, b, alphasA, alphasB) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== PALETTE_COUNT || b.length !== PALETTE_COUNT) {
			return false;
		}
		for (var i = 0; i < PALETTE_COUNT; i++) {
			if (String(a[i]).toLowerCase() !== String(b[i]).toLowerCase()) {
				return false;
			}
			if (alphasA && alphasB) {
				if (Math.abs(normalizeAlpha(alphasA[i], 1) - normalizeAlpha(alphasB[i], 1)) > 0.015) {
					return false;
				}
			}
		}
		return true;
	}

	// Approved art-directed source points mirrored for right-first alternating stages (Cesta soutěží).
	var JOURNEY_DEFAULT_POINTS = [
		{ x: 0.973, y: -0.126, r: 283 },
		{ x: 0.99, y: 0.214, r: 219 },
		{ x: 0.04, y: 0.369, r: 314 },
		{ x: 0.889, y: 0.596, r: 270 },
		{ x: -0.005, y: 0.73, r: 379 },
		{ x: 1.036, y: 0.956, r: 280 },
		{ x: 0.06, y: 0.08, r: 245 }
	];

	// Default art-directed source points spanning the 3 light (#EBEBEB) panels on Best in Design landing
	// (Categories ~0.00-0.33, Media Award ~0.59-0.74, About ~0.74-1.00; dark bands crop/cover cleanly).
	var LANDING_DEFAULT_POINTS = [
		{ x: 0.08, y: 0.08, r: 300 },
		{ x: 0.92, y: 0.14, r: 320 },
		{ x: 0.14, y: 0.28, r: 280 },
		{ x: 0.88, y: 0.30, r: 290 },
		{ x: 0.86, y: 0.65, r: 320 },
		{ x: 0.12, y: 0.69, r: 250 },
		{ x: 0.10, y: 0.84, r: 330 },
		{ x: 0.90, y: 0.92, r: 340 }
	];

	var DEFAULT_STATE = {
		paletteVersion: PALETTE_VERSION,
		seed: DEFAULT_SEED,
		structure: isLandingProfile ? 0.65 : 1,
		avoidText: !isLandingProfile,
		background: 'dark',
		opacity: DEFAULT_OPACITY,
		colors: PROFILE_DEFAULT_COLORS.slice(),
		alphas: PROFILE_DEFAULT_ALPHAS.slice(),
		points: (isLandingProfile ? LANDING_DEFAULT_POINTS : JOURNEY_DEFAULT_POINTS).slice()
	};

	function normalizeBackground(value) {
		return value === 'blue' ? 'blue' : 'dark';
	}

	function cloneState(src) {
		return {
			paletteVersion: PALETTE_VERSION,
			seed: normalizeSeed(src.seed),
			structure: typeof src.structure === 'number' ? src.structure : DEFAULT_STATE.structure,
			avoidText: typeof src.avoidText === 'boolean' ? src.avoidText : !isLandingProfile,
			background: isLandingProfile ? 'dark' : normalizeBackground(src.background),
			opacity: src.opacity === undefined ? DEFAULT_OPACITY : normalizeAlpha(src.opacity, DEFAULT_OPACITY),
			colors: normalizeColors(src.colors),
			alphas: normalizeAlphas(src.alphas),
			points: src.points.slice(0, MAX_POINTS).map(function (pt) {
				return {
					x: Number(pt.x) || 0,
					y: Number(pt.y) || 0,
					r: Math.max(40, Math.min(480, Number(pt.r) || 260))
				};
			})
		};
	}

	function loadState() {
		try {
			var raw = window.localStorage.getItem(STORAGE_KEY);
			if (!raw) {
				return cloneState(DEFAULT_STATE);
			}
			var parsed = JSON.parse(raw);
			if (!parsed || !Array.isArray(parsed.points) || parsed.points.length < 1) {
				return cloneState(DEFAULT_STATE);
			}
			// Preserve user-placed points & background, while upgrading older cached palettes to the Figma default.
			if (parsed.paletteVersion !== PALETTE_VERSION) {
				parsed.colors = PROFILE_DEFAULT_COLORS.slice();
				parsed.alphas = PROFILE_DEFAULT_ALPHAS.slice();
				parsed.opacity = DEFAULT_OPACITY;
				parsed.paletteVersion = PALETTE_VERSION;
			}
			return cloneState(parsed);
		} catch (e) {
			return cloneState(DEFAULT_STATE);
		}
	}

	function saveState(state) {
		try {
			window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
		} catch (e) {
			// Ignore quota / privacy mode failures.
		}
	}

	function clearSavedState() {
		try {
			window.localStorage.removeItem(STORAGE_KEY);
		} catch (e) {
			// Ignore.
		}
	}

	var VERTEX_SHADER = [
		'#version 300 es',
		'out vec2 v_uv;',
		'void main() {',
		'  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);',
		'  v_uv = p;',
		'  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);',
		'}'
	].join('\n');

	var SAMPLE_GLSL = [
		'vec4 transparentSample(sampler2D image, vec2 uv) {',
		'  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(0.0);',
		'  return texture(image, uv);',
		'}'
	].join('\n');

	var WORKING_SPACE_GLSL = [
		'uniform vec2 u_workSize;',
		'uniform vec2 u_workOrigin;',
		'vec2 docPoint(vec2 uv) {',
		'  return u_workOrigin + vec2(uv.x, 1.0 - uv.y) * u_workSize;',
		'}',
		'vec2 workUv(vec2 docP) {',
		'  vec2 uv = (docP - u_workOrigin) / u_workSize;',
		'  return vec2(uv.x, 1.0 - uv.y);',
		'}'
	].join('\n');

	var HASH_GLSL = [
		'float hash21(vec2 p) {',
		'  p = fract(p * vec2(123.34, 456.21));',
		'  p += dot(p, p + 45.32);',
		'  return fract(p.x * p.y);',
		'}'
	].join('\n');

	var SMOOTH_NOISE_GLSL = [
		HASH_GLSL,
		'float vnoise(vec2 p) {',
		'  vec2 i = floor(p), f = fract(p);',
		'  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);',
		'  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));',
		'  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));',
		'  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
		'}',
		'float ribbonSdf(vec2 p, float scale, float structure) {',
		'  vec2 q = p / scale;',
		'  vec2 warp = vec2(vnoise(q * 0.68 + vec2(1.7, 9.2)), vnoise(q * 0.68 + vec2(8.3, 2.8))) - 0.5;',
		'  float f = vnoise(q + warp * 0.92);',
		'  float halfBand = mix(0.19, 0.37, structure);',
		'  return (halfBand - abs(f - 0.5)) * scale * 0.9;',
		'}'
	].join('\n');

	// Document-space painted area driven by independent circular source regions
	// (smoothly merging only when pushed close together) + optional organic text avoidance.
	var PAINTED_AREA_GLSL = [
		'uniform int u_pointCount;',
		'uniform vec3 u_points[' + MAX_POINTS + '];',        // cx, cy, radius
		'uniform int u_textBoxCount;',
		'uniform vec4 u_textBoxes[' + MAX_TEXT_BOXES + '];', // cx, cy, halfW, halfH
		'uniform vec2 u_avoidParams;',                       // cornerRadius, smoothK
		'uniform float u_avoidText;',
		'float smoothMax(float a, float b, float k) {',
		'  float h = max(k - abs(a - b), 0.0) / k;',
		'  return max(a, b) + h * h * k * 0.25;',
		'}',
		'float smoothMin(float a, float b, float k) {',
		'  float h = max(k - abs(a - b), 0.0) / k;',
		'  return min(a, b) - h * h * k * 0.25;',
		'}',
		'float sdRoundedBox(vec2 p, vec2 halfSize, float radius) {',
		'  float r = min(radius, min(halfSize.x, halfSize.y));',
		'  vec2 q = abs(p) - (halfSize - vec2(r));',
		'  return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;',
		'}',
		'vec3 paintedAreaParts(vec2 p) {',
		'  float rawPoints = -1e6;',
		'  for (int i = 0; i < ' + MAX_POINTS + '; i++) {',
		'    if (i >= u_pointCount) break;',
		'    vec3 pt = u_points[i];',
		'    float d = pt.z - length(p - pt.xy);',
		'    rawPoints = (i == 0) ? d : smoothMax(rawPoints, d, 56.0);',
		'  }',
		'  float clearOfText = 1e6;',
		'  if (u_avoidText > 0.5 && u_textBoxCount > 0) {',
		'    for (int j = 0; j < ' + MAX_TEXT_BOXES + '; j++) {',
		'      if (j >= u_textBoxCount) break;',
		'      vec4 box = u_textBoxes[j];',
		'      float boxDist = sdRoundedBox(p - box.xy, box.zw, u_avoidParams.x);',
		'      clearOfText = min(clearOfText, boxDist);',
		'    }',
		'  }',
		'  float area = (u_avoidText > 0.5 && u_textBoxCount > 0) ? smoothMin(rawPoints, clearOfText, u_avoidParams.y) : rawPoints;',
		'  return vec3(area, rawPoints, clearOfText);',
		'}',
		'float paintedAreaDistance(vec2 p) {',
		'  return paintedAreaParts(p).x;',
		'}'
	].join('\n');

	var SOURCE_FRAGMENT = [
		'#version 300 es',
		'precision highp float;',
		'in vec2 v_uv;',
		'out vec4 outColor;',
		'uniform float u_structure;',
		'uniform vec4 u_seedGeo;',
		WORKING_SPACE_GLSL,
		SMOOTH_NOISE_GLSL,
		PAINTED_AREA_GLSL,
		'float areaColorPhase(vec2 p) {',
		'  vec2 q = (p - vec2(960.0, 540.0)) / 520.0 + u_seedGeo.zw;',
		'  vec2 warp = vec2(vnoise(q * 0.72 + vec2(3.1, 7.4)), vnoise(q * 0.72 + vec2(11.2, 1.9))) - 0.5;',
		'  float u = (q.x * 0.78 + q.y * 0.64) + warp.x * 0.72 + warp.y * 0.48 - 0.12;',
		'  float tri = 0.5 + 0.5 * asin(0.92 * sin(u * 3.14159265)) / 1.16808049;',
		'  float drift = (vnoise(q * 0.85 + warp * 0.6 + vec2(2.3, 4.7)) - 0.5) * 0.22;',
		'  return clamp(tri + drift, 0.0, 1.0);',
		'}',
		'void main() {',
		'  vec2 p = docPoint(v_uv);',
		'  float rawDist = paintedAreaDistance(p);',
		'  float distance = rawDist;',
		'  if (rawDist > -26.0) {',
		'    float fieldScale = mix(275.0, 375.0, u_structure);',
		'    vec2 centered = p - vec2(960.0, 540.0) + u_seedGeo.xy;',
		'    float cavitySdf = ribbonSdf(centered + vec2(130.0, 75.0), fieldScale, u_structure);',
		'    float interior = smoothstep(34.0, 112.0, rawDist);',
		'    float rimNoise = vnoise(centered / 210.0 + vec2(3.7, 8.1)) - 0.5;',
		'    float rimMod = rimNoise * 48.0 * smoothstep(-18.0, 28.0, rawDist) * (1.0 - interior * 0.55);',
		'    distance = min(rawDist + rimMod, mix(rawDist + rimMod, cavitySdf, interior));',
		'  }',
		'  float edge = max(fwidth(distance) * 0.5, 0.5);',
		'  float alpha = smoothstep(-edge, edge, distance);',
		'  float phase = areaColorPhase(p);',
		'  outColor = vec4(phase, 0.0, 0.0, alpha);',
		'}'
	].join('\n');

	var WAVE_FRAGMENT = [
		'#version 300 es',
		'precision highp float;',
		'in vec2 v_uv;',
		'out vec4 outColor;',
		'uniform sampler2D u_input;',
		'uniform float u_time;',
		'uniform float u_waveOffset;',
		'uniform vec4 u_palette[' + PALETTE_COUNT + '];',
		WORKING_SPACE_GLSL,
		SAMPLE_GLSL,
		'vec4 colorama(float t) {',
		'  float s = clamp(t, 0.0, 1.0);',
		'  for (int i = 1; i < ' + PALETTE_COUNT + '; i++) {',
		'    float stopPos = float(i) / ' + (PALETTE_COUNT - 1).toFixed(1) + ';',
		'    if (s <= stopPos) {',
		'      float prevPos = float(i - 1) / ' + (PALETTE_COUNT - 1).toFixed(1) + ';',
		'      float weight = (s - prevPos) / (stopPos - prevPos);',
		'      vec4 c0 = u_palette[i - 1];',
		'      vec4 c1 = u_palette[i];',
		'      return vec4(mix(c0.rgb, c1.rgb, weight) / 255.0, mix(c0.a, c1.a, weight));',
		'    }',
		'  }',
		'  vec4 last = u_palette[' + (PALETTE_COUNT - 1) + '];',
		'  return vec4(last.rgb / 255.0, last.a);',
		'}',
		'void main() {',
		'  vec2 p = docPoint(v_uv);',
		'  float phase = 2.0 * fract((p.x + 0.18 + u_waveOffset - u_time * 106.7) / 485.0) - 1.0;',
		'  p.y += 100.0 * (2.0 * sqrt(max(0.0, 1.0 - phase * phase)) - 1.0) - 0.23;',
		'  vec4 value = transparentSample(u_input, workUv(p));',
		'  if (value.a > 0.16) {',
		'    float edgeA = smoothstep(0.16, 0.44, value.a);',
		'    vec4 c = colorama(value.r);',
		'    float finalA = edgeA * clamp(c.a, 0.0, 1.0);',
		'    value = vec4(c.rgb * finalA, finalA);',
		'  } else {',
		'    value = vec4(0.0);',
		'  }',
		'  outColor = value;',
		'}'
	].join('\n');

	var FILTER_FRAGMENT = [
		'#version 300 es',
		'precision highp float;',
		'in vec2 v_uv;',
		'out vec4 outColor;',
		'uniform sampler2D u_input;',
		'uniform vec2 u_direction;',
		'uniform float u_radial;',
		'uniform float u_angleOffset;',
		'uniform int u_pointCount;',
		'uniform vec3 u_points[' + MAX_POINTS + '];',
		WORKING_SPACE_GLSL,
		SAMPLE_GLSL,
		'void main() {',
		'  vec4 value = vec4(0.0);',
		'  if (u_radial > 0.5) {',
		'    vec2 p = docPoint(v_uv);',
		'    vec2 pivot = vec2(0.0);',
		'    float wSum = 0.0;',
		'    for (int k = 0; k < ' + MAX_POINTS + '; k++) {',
		'      if (k >= u_pointCount) break;',
		'      // Offset each island pivot asymmetrically (~155 AE-px) so the near',
		'      // side stays razor-sharp while the far side sweeps into dreamy AE',
		'      // radial motion blur, matching the crisp-vs-soft Kantýna/AE look.',
		'      float a = float(k) * 2.3999632 + 0.55 + u_angleOffset;',
		'      vec2 c = u_points[k].xy;',
		'      vec2 eccPivot = c + vec2(cos(a), sin(a)) * 155.0;',
		'      float d2 = dot(p - c, p - c);',
		'      float w = exp(-d2 / (2.0 * 380.0 * 380.0)) + 1e-6;',
		'      pivot += eccPivot * w;',
		'      wSum += w;',
		'    }',
		'    pivot /= max(wSum, 1e-6);',
		'    vec2 rel = p - pivot;',
		'    float radiusScale = min(1.0, 420.0 / max(length(rel), 1.0));',
		'    for (int i = -12; i <= 12; i++) {',
		'      float angle = (float(i) / 12.0 * 6.9194591 + 0.318725861) * 0.01745329252 * radiusScale;',
		'      float c = cos(angle);',
		'      float s = sin(angle);',
		'      vec2 q = mat2(c, -s, s, c) * rel;',
		'      value += transparentSample(u_input, workUv(pivot + q));',
		'    }',
		'    value /= 25.0;',
		'  } else {',
		'    for (int i = -5; i <= 5; i++) {',
		'      value += texture(u_input, v_uv + u_direction * float(i));',
		'    }',
		'    value /= 11.0;',
		'  }',
		'  outColor = value;',
		'}'
	].join('\n');

	var COMPOSE_FRAGMENT = [
		'#version 300 es',
		'precision highp float;',
		'in vec2 v_uv;',
		'out vec4 outColor;',
		'uniform sampler2D u_input;',
		'uniform sampler2D u_displacement;',
		'uniform vec2 u_viewSize;',
		'uniform vec2 u_viewOrigin;',
		'uniform float u_structure;',
		'uniform float u_portrait;',
		'uniform float u_debugMode;', // 0: off, 1: liquid + area, 2: area only, 3: liquid + handles only
		'uniform float u_blueBg;',
		'uniform float u_opacity;',
		'uniform vec4 u_seedDisp;',
		WORKING_SPACE_GLSL,
		HASH_GLSL,
		SAMPLE_GLSL,
		PAINTED_AREA_GLSL,
		'vec2 sampleTileDisplacement(vec2 pos, vec2 shift, out float weight) {',
		'  vec2 p = pos + shift;',
		'  vec2 id = floor(p);',
		'  vec2 f = fract(p);',
		'  // C1-smooth Hann window: value and gradient are both zero at every tile edge.',
		'  vec2 s = sin(f * 3.14159265);',
		'  weight = (s.x * s.x) * (s.y * s.y);',
		'  vec2 j = vec2(',
		'    hash21(id + u_seedDisp.zw + vec2(13.7, 41.3)),',
		'    hash21(id + u_seedDisp.zw + vec2(71.9, 19.1))',
		'  ) - 0.5;',
		'  float rot = step(0.5, hash21(id + u_seedDisp.wz + vec2(5.3, 29.7)));',
		'  vec2 localUv = mix(f, 1.0 - f, rot);',
		'  vec2 dispUv = mix(vec2(0.22, 0.18), vec2(0.78, 0.82), localUv) + j * vec2(0.08, 0.08);',
		'  vec4 packed = texture(u_displacement, dispUv);',
		'  vec2 d = (vec2(packed.r * 256.0 + packed.g, packed.b * 256.0 + packed.a) * 255.0 - 32768.0) / 32.0;',
		'  return mix(d, -d, rot);',
		'}',
		'vec2 sampleDisplacement(vec2 docP) {',
		'  // 4-tap half-shifted C1-smooth overlapping tile blend across the high-energy',
		'  // interior [0.18..0.82] x [0.14..0.86] of the AE turbulence map at exact 1:1',
		'  // native pixel scale, with variance-preserving normalization and zero mirror',
		'  // seams or V-cusp folds.',
		'  vec2 oriented = u_portrait > 0.5 ? vec2(docP.y, docP.x) : docP;',
		'  vec2 pos = (oriented + vec2(320.0, 180.0) + u_seedDisp.xy) / vec2(1075.2, 691.2);',
		'  float w0, w1, w2, w3;',
		'  vec2 d0 = sampleTileDisplacement(pos, vec2(0.0, 0.0), w0);',
		'  vec2 d1 = sampleTileDisplacement(pos, vec2(0.5, 0.0), w1);',
		'  vec2 d2 = sampleTileDisplacement(pos, vec2(0.0, 0.5), w2);',
		'  vec2 d3 = sampleTileDisplacement(pos, vec2(0.5, 0.5), w3);',
		'  float norm = inversesqrt(max(w0 * w0 + w1 * w1 + w2 * w2 + w3 * w3, 1e-6));',
		'  vec2 d = (d0 * w0 + d1 * w1 + d2 * w2 + d3 * w3) * norm;',
		'  return u_portrait > 0.5 ? vec2(-d.y, d.x) : d;',
		'}',
		'vec4 warpedSample(vec2 docP) {',
		'  vec2 q = docP + sampleDisplacement(docP) * mix(1.35, 0.65, u_structure);',
		'  return transparentSample(u_input, workUv(q));',
		'}',
		'vec4 blendOver(vec4 dst, vec4 src) {',
		'  return src + dst * (1.0 - src.a);',
		'}',
		'void main() {',
		'  vec2 docP = u_viewOrigin + vec2(v_uv.x, 1.0 - v_uv.y) * u_viewSize;',
		'  bool showLiquid = u_debugMode < 1.5 || u_debugMode > 2.5;',
		'  bool showGuides = u_debugMode > 0.5 && u_debugMode < 2.5;',
		'  vec4 liquid = vec4(0.0);',
		'  vec3 areaParts = paintedAreaParts(docP);',
		'  if (showLiquid) {',
		'    vec2 dx = dFdx(docP) * 0.25;',
		'    vec2 dy = dFdy(docP) * 0.25;',
		'    liquid = (',
		'      warpedSample(docP + dx + dy) +',
		'      warpedSample(docP + dx - dy) +',
		'      warpedSample(docP - dx + dy) +',
		'      warpedSample(docP - dx - dy)',
		'    ) * 0.25;',
		'    float limitDist = areaParts.x;',
		'    vec2 disp = sampleDisplacement(docP);',
		'    float organicShift = clamp((disp.x - disp.y * 0.7) * 0.14, -34.0, 34.0) * smoothstep(-152.0, -106.0, limitDist);',
		'    liquid *= smoothstep(-144.0, -78.0, limitDist + organicShift);',
		'    liquid *= clamp(u_opacity, 0.0, 1.0);',
		'  }',
		'  if (showGuides) {',
		'    float px = max(max(abs(dFdx(docP.x)), abs(dFdy(docP.y))), 1.0);',
		'    if (u_avoidText > 0.5 && u_textBoxCount > 0) {',
		'      float textInside = smoothstep(px, -px, areaParts.z);',
		'      float textStroke = smoothstep(1.8 * px, 0.0, abs(areaParts.z));',
		'      vec3 coral = vec3(0.992, 0.239, 0.384);',
		'      liquid = blendOver(liquid, vec4(coral * (textInside * 0.10), textInside * 0.10));',
		'      liquid = blendOver(liquid, vec4(coral * (textStroke * 0.72), textStroke * 0.72));',
		'    }',
		'    float areaInside = smoothstep(-px, px, areaParts.x);',
		'    float areaStroke = smoothstep(2.2 * px, 0.0, abs(areaParts.x));',
		'    float fillAlpha = u_debugMode > 1.5 ? 0.38 : 0.20;',
		'    vec3 guideBlue = u_blueBg > 0.5 ? vec3(0.12, 0.16, 0.28) : vec3(0.38, 0.73, 1.0);',
		'    liquid = blendOver(liquid, vec4(guideBlue * (areaInside * fillAlpha), areaInside * fillAlpha));',
		'    liquid = blendOver(liquid, vec4(guideBlue * (areaStroke * 0.95), areaStroke * 0.95));',
		'  }',
		'  outColor = liquid;',
		'}'
	].join('\n');

	function compileShader(gl, type, source) {
		var shader = gl.createShader(type);
		if (!shader) {
			return null;
		}
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			gl.deleteShader(shader);
			return null;
		}
		return shader;
	}

	function createProgram(gl, vertexShader, fragmentSource, uniformNames) {
		var fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
		if (!fragmentShader) {
			return null;
		}
		var program = gl.createProgram();
		if (!program) {
			gl.deleteShader(fragmentShader);
			return null;
		}
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);
		gl.deleteShader(fragmentShader);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			gl.deleteProgram(program);
			return null;
		}

		var uniforms = {};
		for (var i = 0; i < uniformNames.length; i++) {
			uniforms[uniformNames[i]] = gl.getUniformLocation(program, uniformNames[i]);
		}
		return { program: program, uniforms: uniforms };
	}

	function createLinearTexture(gl, wrapMode) {
		var wrap = wrapMode || gl.CLAMP_TO_EDGE;
		var texture = gl.createTexture();
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
		return texture;
	}

	function createRenderTarget(gl) {
		return {
			texture: createLinearTexture(gl, gl.CLAMP_TO_EDGE),
			framebuffer: gl.createFramebuffer()
		};
	}

	function allocateTargets(gl, targets, width, height, preferFloat) {
		var formats = preferFloat ? [true, false] : [false];
		for (var f = 0; f < formats.length; f++) {
			var useFloat = formats[f];
			var internalFormat = useFloat ? gl.RGBA16F : gl.RGBA8;
			var type = useFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
			var ok = true;

			for (var i = 0; i < targets.length; i++) {
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, targets[i].texture);
				gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);
				gl.bindFramebuffer(gl.FRAMEBUFFER, targets[i].framebuffer);
				gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, targets[i].texture, 0);
				if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
					ok = false;
					break;
				}
			}

			if (ok) {
				return true;
			}
		}
		return false;
	}

	function decodeDisplacementMap(url) {
		return fetch(url, { credentials: 'same-origin' })
			.then(function (response) {
				if (!response.ok || !response.body) {
					throw new Error('Map fetch failed');
				}
				var decompressed = response.body.pipeThrough(new window.DecompressionStream('gzip'));
				return new Response(decompressed).arrayBuffer();
			})
			.then(function (buffer) {
				var expectedLength = MAP_WIDTH * MAP_HEIGHT * 2;
				var deltas = new Int16Array(buffer);
				if (deltas.length !== expectedLength) {
					throw new Error('Unexpected displacement map size');
				}

				var pixels = new Uint8Array(deltas.length * 2);
				for (var y = 0; y < MAP_HEIGHT; y++) {
					var rowOffset = y * MAP_WIDTH * 2;
					for (var x = 0; x < MAP_WIDTH; x++) {
						var base = rowOffset + x * 2;
						for (var c = 0; c < 2; c++) {
							var i = base + c;
							if (x > 0) {
								deltas[i] += deltas[i - 2];
							}
							var value = deltas[i] + 32768;
							pixels[i * 2] = (value >> 8) & 255;
							pixels[i * 2 + 1] = value & 255;
						}
					}
				}
				return pixels;
			});
	}

	function unionChildrenRect(element) {
		var children = element.querySelectorAll('h1, h2, h3, p, li, a');
		var left = Infinity;
		var top = Infinity;
		var right = -Infinity;
		var bottom = -Infinity;
		var found = false;

		for (var i = 0; i < children.length; i++) {
			var r = children[i].getBoundingClientRect();
			if (r.width <= 0 || r.height <= 0) {
				continue;
			}
			if (r.left < left) left = r.left;
			if (r.top < top) top = r.top;
			if (r.right > right) right = r.right;
			if (r.bottom > bottom) bottom = r.bottom;
			found = true;
		}

		if (!found) {
			return element.getBoundingClientRect();
		}
		return {
			left: left,
			top: top,
			right: right,
			bottom: bottom,
			width: right - left,
			height: bottom - top
		};
	}

	function svgEl(tag, attrs) {
		var el = document.createElementNS(SVG_NS, tag);
		if (attrs) {
			var keys = Object.keys(attrs);
			for (var i = 0; i < keys.length; i++) {
				el.setAttribute(keys[i], String(attrs[keys[i]]));
			}
		}
		return el;
	}

	function init() {
		var mainEl = document.querySelector('main');
		var journeyEl = isLandingProfile ? null : document.querySelector('.zdw-bid-journey');
		var stageEls = journeyEl ? Array.prototype.slice.call(journeyEl.querySelectorAll('.zdw-bid-stage')) : [];
		var lightBandEls =
			isLandingProfile && mainEl
				? Array.prototype.slice.call(
						mainEl.querySelectorAll('.zdw-bid-categories, .zdw-bid-media-band, .zdw-bid-about-band')
					)
				: [];
		if (!mainEl || (isLandingProfile ? !lightBandEls.length : !journeyEl || !stageEls.length)) {
			return;
		}

		var titleEl = isLandingProfile ? null : mainEl.querySelector('h1.page-title');
		var statementEl = isLandingProfile ? null : mainEl.querySelector('.zdw-bid-journey-page p.zdw-statement--sm');
		var rulesEl = isLandingProfile ? null : mainEl.querySelector('.zdw-bid-rules-summary');

		var canvas = document.createElement('canvas');
		canvas.className = 'zdw-bid-liquid-bg';
		canvas.setAttribute('aria-hidden', 'true');

		var gl = canvas.getContext('webgl2', {
			alpha: true,
			antialias: false,
			depth: false,
			stencil: false,
			premultipliedAlpha: true,
			preserveDrawingBuffer: false,
			powerPreference: 'low-power'
		});
		if (!gl) {
			return;
		}

		var vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
		if (!vertexShader) {
			return;
		}

		var sourceProgram = createProgram(gl, vertexShader, SOURCE_FRAGMENT, [
			'u_workSize',
			'u_workOrigin',
			'u_structure',
			'u_seedGeo',
			'u_pointCount',
			'u_points[0]',
			'u_textBoxCount',
			'u_textBoxes[0]',
			'u_avoidParams',
			'u_avoidText'
		]);
		var waveProgram = createProgram(gl, vertexShader, WAVE_FRAGMENT, [
			'u_input',
			'u_workSize',
			'u_workOrigin',
			'u_time',
			'u_waveOffset',
			'u_palette[0]'
		]);
		var filterProgram = createProgram(gl, vertexShader, FILTER_FRAGMENT, [
			'u_input',
			'u_direction',
			'u_radial',
			'u_angleOffset',
			'u_workSize',
			'u_workOrigin',
			'u_pointCount',
			'u_points[0]'
		]);
		var composeProgram = createProgram(gl, vertexShader, COMPOSE_FRAGMENT, [
			'u_input',
			'u_displacement',
			'u_workSize',
			'u_workOrigin',
			'u_viewSize',
			'u_viewOrigin',
			'u_structure',
			'u_portrait',
			'u_debugMode',
			'u_blueBg',
			'u_opacity',
			'u_seedDisp',
			'u_pointCount',
			'u_points[0]',
			'u_textBoxCount',
			'u_textBoxes[0]',
			'u_avoidParams',
			'u_avoidText'
		]);
		gl.deleteShader(vertexShader);

		if (!sourceProgram || !waveProgram || !filterProgram || !composeProgram) {
			return;
		}

		var canUseFloat = Boolean(
			gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float')
		);
		var targets = [createRenderTarget(gl), createRenderTarget(gl)];
		var displacementTexture = createLinearTexture(gl, gl.CLAMP_TO_EDGE);
		var vao = gl.createVertexArray();
		gl.bindVertexArray(vao);
		gl.disable(gl.DITHER);
		gl.disable(gl.BLEND);
		gl.clearColor(0, 0, 0, 0);

		var state = loadState();
		var seedParams = computeSeedParams(state.seed);
		var selectedIndex = 0;
		var activeStopIndex = 0;

		var pointsData = new Float32Array(MAX_POINTS * 3);
		var paletteData = new Float32Array(PALETTE_COUNT * 4);
		var textBoxesData = new Float32Array(MAX_TEXT_BOXES * 4);
		var pointCount = 0;
		var textBoxCount = 0;
		var avoidCornerRadius = 72;
		var avoidSmoothK = 82;
		var journeyBox = { left: 0, top: 0, width: 1, height: 1 };

		var destroyed = false;
		var isVisible = true;
		var isReducedMotion = false;
		var isDisabled = false;
		var isFlipped = false;
		try {
			isDisabled = isLandingProfile ? false : window.localStorage.getItem(DISABLED_STORAGE_KEY) === '1';
			isFlipped = isLandingProfile ? false : window.localStorage.getItem(FLIP_STORAGE_KEY) === '1';
		} catch (e) {
			isDisabled = false;
			isFlipped = false;
		}
		var debugMode = 0; // 0: off, 1: liquid + area, 2: area only, 3: liquid + handles only
		var debugBar = null;
		var toggleEl = null;
		var toggleInput = null;
		var flipInput = null;
		var bgInput = null;
		var editorBtn = null;
		var cmplzObserver = null;
		var editorSvg = null;
		var dragState = null;
		var rafId = 0;
		var lastRenderMs = 0;
		var ambientTime = STATIC_TIME;
		var lastScrollY = -1;
		var scrollDirty = true;
		var viewportW = 1;
		var viewportH = 1;
		var canvasW = 1;
		var canvasH = 1;
		var aeScale = 1;
		var workW = 0;
		var workH = 0;

		try {
			var params = new window.URLSearchParams(window.location.search);
			var rawEditParam = null;
			var editKeys = ['liquid-edit', 'liquid-debug', 'liquid-editor', 'edit-liquid'];
			for (var ek = 0; ek < editKeys.length; ek++) {
				if (params.has(editKeys[ek])) {
					rawEditParam = (params.get(editKeys[ek]) || '').trim().toLowerCase();
					break;
				}
			}
			if (rawEditParam !== null) {
				if (rawEditParam === '0' || rawEditParam === 'false' || rawEditParam === 'off') {
					debugMode = 0;
				} else if (rawEditParam === 'area' || rawEditParam === '2') {
					debugMode = 2;
				} else if (rawEditParam === 'handles' || rawEditParam === '3') {
					debugMode = 3;
				} else {
					debugMode = 1;
				}
			}
			if (!isLandingProfile) {
				var bgParam = (params.get('liquid-bg') || '').toLowerCase();
				if (bgParam === 'blue' || bgParam === 'dark') {
					state.background = bgParam;
				}
			}
			var seedParam = params.get('liquid-seed');
			if (seedParam !== null && seedParam.trim() !== '') {
				state.seed = normalizeSeed(seedParam);
				seedParams = computeSeedParams(state.seed);
			}
		} catch (e) {
			debugMode = 0;
		}

		var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
		isReducedMotion = Boolean(motionQuery && motionQuery.matches);

		function normToCss(nx, ny) {
			return {
				x: journeyBox.left + nx * journeyBox.width,
				y: journeyBox.top + ny * journeyBox.height
			};
		}

		function cssToNorm(cssX, cssY) {
			return {
				x: (cssX - journeyBox.left) / Math.max(1, journeyBox.width),
				y: (cssY - journeyBox.top) / Math.max(1, journeyBox.height)
			};
		}

		function currentRadiusCssScale() {
			if (viewportW <= 640) {
				return Math.max(0.38, Math.min(0.56, viewportW / 760));
			}
			return viewportW <= 860 ? Math.max(0.56, Math.min(0.76, viewportW / 1080)) : 1.0;
		}

		function rebuildSeedUniforms() {
			state.seed = normalizeSeed(state.seed);
			seedParams = computeSeedParams(state.seed);
		}

		function rebuildPaletteUniform() {
			var colors = normalizeColors(state.colors);
			var alphas = normalizeAlphas(state.alphas);
			state.colors = colors;
			state.alphas = alphas;
			state.opacity = normalizeAlpha(state.opacity, DEFAULT_OPACITY);
			for (var i = 0; i < PALETTE_COUNT; i++) {
				var value = parseInt(colors[i].slice(1), 16);
				paletteData[i * 4] = (value >> 16) & 255;
				paletteData[i * 4 + 1] = (value >> 8) & 255;
				paletteData[i * 4 + 2] = value & 255;
				paletteData[i * 4 + 3] = alphas[i];
			}
		}

		function rebuildPointUniforms() {
			var pts = state.points;
			var count = Math.min(pts.length, MAX_POINTS);
			var cssScale = currentRadiusCssScale();
			var frameMobileEdges = !isLandingProfile && viewportW <= 860 && debugMode === 0;

			pointCount = count;
			for (var i = 0; i < count; i++) {
				var nx = pts[i].x;
				if (!isLandingProfile && isFlipped && pts[i].y > 0 && debugMode === 0) {
					nx = 1 - nx;
				}
				if (frameMobileEdges && nx > 0.14 && nx < 0.86) {
					nx = nx < 0.5 ? -0.04 : 1.04;
				}
				var pCss = normToCss(nx, pts[i].y);
				pointsData[i * 3] = pCss.x * aeScale;
				pointsData[i * 3 + 1] = pCss.y * aeScale;
				pointsData[i * 3 + 2] = pts[i].r * cssScale * aeScale;
			}
		}

		function pushTextBox(rect, scrollX, scrollY, padX, padY) {
			if (textBoxCount >= MAX_TEXT_BOXES || !rect || rect.width <= 0 || rect.height <= 0) {
				return;
			}
			var cx = (rect.left + scrollX + rect.width * 0.5) * aeScale;
			var cy = (rect.top + scrollY + rect.height * 0.5) * aeScale;
			var hw = (rect.width * 0.5 + padX) * aeScale;
			var hh = (rect.height * 0.5 + padY) * aeScale;
			var offset = textBoxCount * 4;
			textBoxesData[offset] = cx;
			textBoxesData[offset + 1] = cy;
			textBoxesData[offset + 2] = hw;
			textBoxesData[offset + 3] = hh;
			textBoxCount++;
		}

		function measureLayout() {
			var scrollX = window.scrollX || window.pageXOffset || 0;
			var scrollY = window.scrollY || window.pageYOffset || 0;
			var isMobile = viewportW <= 860;

			if (isLandingProfile) {
				var minTop = Infinity;
				var maxBottom = -Infinity;
				for (var lb = 0; lb < lightBandEls.length; lb++) {
					var br = lightBandEls[lb].getBoundingClientRect();
					if (br.height <= 0) {
						continue;
					}
					var topDoc = br.top + scrollY;
					var bottomDoc = br.bottom + scrollY;
					if (topDoc < minTop) minTop = topDoc;
					if (bottomDoc > maxBottom) maxBottom = bottomDoc;
				}
				if (!isFinite(minTop) || !isFinite(maxBottom) || maxBottom <= minTop) {
					var mr = mainEl.getBoundingClientRect();
					minTop = mr.top + scrollY;
					maxBottom = mr.bottom + scrollY;
				}
				journeyBox.left = 0;
				journeyBox.top = minTop;
				journeyBox.width = Math.max(1, document.documentElement.clientWidth || viewportW);
				journeyBox.height = Math.max(1, maxBottom - minTop);
			} else {
				var jr = journeyEl.getBoundingClientRect();
				journeyBox.left = jr.left + scrollX;
				journeyBox.top = jr.top + scrollY;
				journeyBox.width = Math.max(1, jr.width);
				journeyBox.height = Math.max(1, jr.height);
			}

			rebuildPointUniforms();

			textBoxCount = 0;
			var padX = isMobile ? 22 : 60;
			var padY = isMobile ? 34 : 70;
			avoidCornerRadius = (isMobile ? 40 : 74) * aeScale;
			avoidSmoothK = (isMobile ? 46 : 82) * aeScale;

			if (isLandingProfile) {
				var avoidTargets = mainEl.querySelectorAll(
					'.zdw-bid-categories h2, .zdw-bid-category-grid, .zdw-bid-media-band .zdw-bid-media-award, .zdw-bid-about-band h2, .zdw-bid-about-band .wp-block-columns'
				);
				for (var a = 0; a < avoidTargets.length; a++) {
					pushTextBox(avoidTargets[a].getBoundingClientRect(), scrollX, scrollY, padX * 0.65, padY * 0.65);
				}
			} else {
				if (titleEl) {
					pushTextBox(titleEl.getBoundingClientRect(), scrollX, scrollY, padX, padY);
				}
				if (statementEl) {
					pushTextBox(statementEl.getBoundingClientRect(), scrollX, scrollY, padX, padY);
				}
				for (var s = 0; s < stageEls.length; s++) {
					pushTextBox(unionChildrenRect(stageEls[s]), scrollX, scrollY, padX, padY);
				}
				if (rulesEl) {
					pushTextBox(rulesEl.getBoundingClientRect(), scrollX, scrollY, padX, padY + 12);
				}
			}

			if (editorSvg) {
				renderEditorSvg();
			}
		}

		function updateViewportMetrics() {
			viewportW = Math.max(1, window.innerWidth);
			viewportH = Math.max(1, window.innerHeight);

			var dpr = Math.min(window.devicePixelRatio || 1, 2);
			var maxDim = 2560;
			var rawW = Math.round(viewportW * dpr);
			var rawH = Math.round(viewportH * dpr);
			var clampScale = Math.min(1, maxDim / Math.max(rawW, rawH));

			canvasW = Math.max(1, Math.round(rawW * clampScale));
			canvasH = Math.max(1, Math.round(rawH * clampScale));
			if (canvas.width !== canvasW || canvas.height !== canvasH) {
				canvas.width = canvasW;
				canvas.height = canvasH;
			}

			// Match ZDW-liquid's canonical 1080-short-side working resolution so
			// Fast Box Blur (radius 5) and Radial Blur keep their exact AE sharpness
			// instead of getting magnified/blurred on desktop screens.
			var shortSide = Math.min(viewportW, viewportH);
			var canonicalScale = 1080 / Math.max(shortSide, 360);
			aeScale = Math.min(
				canonicalScale,
				(MAX_WORK_W - 2 * PAD_AE) / viewportW,
				(MAX_WORK_H - 2 * PAD_AE) / viewportH
			);

			var nextWorkW = Math.max(256, Math.ceil(viewportW * aeScale) + 2 * PAD_AE);
			var nextWorkH = Math.max(256, Math.ceil(viewportH * aeScale) + 2 * PAD_AE);

			if (nextWorkW !== workW || nextWorkH !== workH) {
				if (!allocateTargets(gl, targets, nextWorkW, nextWorkH, canUseFloat)) {
					cleanup();
					return false;
				}
				workW = nextWorkW;
				workH = nextWorkH;
			}

			measureLayout();
			scrollDirty = true;
			return true;
		}

		function bindPaintedArea(uniforms) {
			gl.uniform1i(uniforms.u_pointCount, pointCount);
			gl.uniform3fv(uniforms['u_points[0]'], pointsData);
			gl.uniform1i(uniforms.u_textBoxCount, textBoxCount);
			gl.uniform4fv(uniforms['u_textBoxes[0]'], textBoxesData);
			gl.uniform2f(uniforms.u_avoidParams, avoidCornerRadius, avoidSmoothK);
			gl.uniform1f(uniforms.u_avoidText, state.avoidText ? 1 : 0);
		}

		function renderFrame() {
			if (destroyed || gl.isContextLost() || !workW || !workH) {
				return;
			}

			var scrollX = window.scrollX || window.pageXOffset || 0;
			var scrollY = window.scrollY || window.pageYOffset || 0;
			lastScrollY = scrollY;
			scrollDirty = false;

			var viewOriginX = scrollX * aeScale;
			var viewOriginY = scrollY * aeScale;
			var viewSizeX = viewportW * aeScale;
			var viewSizeY = viewportH * aeScale;
			var workOriginX = viewOriginX - PAD_AE;
			var workOriginY = viewOriginY - PAD_AE;

			var effectiveTime = isReducedMotion ? STATIC_TIME : ambientTime + scrollY * SCROLL_PHASE_PER_PX;
			var wrappedTime = ((effectiveTime % WAVE_PERIOD) + WAVE_PERIOD) % WAVE_PERIOD;

			if (debugMode !== 2) {
				// Pass 0: New 6de4877 sculptural ribbons + voids + continuous phase field
				gl.useProgram(sourceProgram.program);
				gl.uniform2f(sourceProgram.uniforms.u_workSize, workW, workH);
				gl.uniform2f(sourceProgram.uniforms.u_workOrigin, workOriginX, workOriginY);
				gl.uniform1f(sourceProgram.uniforms.u_structure, state.structure);
				gl.uniform4fv(sourceProgram.uniforms.u_seedGeo, seedParams.geo);
				bindPaintedArea(sourceProgram.uniforms);
				gl.bindFramebuffer(gl.FRAMEBUFFER, targets[0].framebuffer);
				gl.viewport(0, 0, workW, workH);
				gl.drawArrays(gl.TRIANGLES, 0, 3);

				// Pass 1: Semicircle Wave Warp + float Colorama into targets[1]
				gl.useProgram(waveProgram.program);
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, targets[0].texture);
				gl.uniform1i(waveProgram.uniforms.u_input, 0);
				gl.uniform2f(waveProgram.uniforms.u_workSize, workW, workH);
				gl.uniform2f(waveProgram.uniforms.u_workOrigin, workOriginX, workOriginY);
				gl.uniform1f(waveProgram.uniforms.u_time, wrappedTime);
				gl.uniform1f(waveProgram.uniforms.u_waveOffset, seedParams.waveOffset);
				gl.uniform4fv(waveProgram.uniforms['u_palette[0]'], paletteData);
				gl.bindFramebuffer(gl.FRAMEBUFFER, targets[1].framebuffer);
				gl.drawArrays(gl.TRIANGLES, 0, 3);

				// Pass 2: 6x separable Fast Box Blur + 1x capped-radius Radial Blur
				gl.useProgram(filterProgram.program);
				gl.uniform1i(filterProgram.uniforms.u_input, 0);
				gl.uniform2f(filterProgram.uniforms.u_workSize, workW, workH);
				gl.uniform2f(filterProgram.uniforms.u_workOrigin, workOriginX, workOriginY);
				gl.uniform1f(filterProgram.uniforms.u_angleOffset, seedParams.angleOffset);
				gl.uniform1i(filterProgram.uniforms.u_pointCount, pointCount);
				gl.uniform3fv(filterProgram.uniforms['u_points[0]'], pointsData);
				var readIndex = 1;
				for (var p = 0; p < 7; p++) {
					var writeIndex = 1 - readIndex;
					gl.activeTexture(gl.TEXTURE0);
					gl.bindTexture(gl.TEXTURE_2D, targets[readIndex].texture);
					gl.bindFramebuffer(gl.FRAMEBUFFER, targets[writeIndex].framebuffer);
					gl.uniform2f(
						filterProgram.uniforms.u_direction,
						p % 2 === 0 ? 1 / workW : 0,
						p % 2 === 1 ? 1 / workH : 0
					);
					gl.uniform1f(filterProgram.uniforms.u_radial, p === 6 ? 1 : 0);
					gl.drawArrays(gl.TRIANGLES, 0, 3);
					readIndex = writeIndex;
				}

				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, targets[readIndex].texture);
			} else {
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, targets[0].texture);
			}

			// Pass 3: 2x2 supersampled Turbulent Displace + organic reach taper (+ optional debug guide)
			gl.useProgram(composeProgram.program);
			gl.uniform1i(composeProgram.uniforms.u_input, 0);
			gl.activeTexture(gl.TEXTURE4);
			gl.bindTexture(gl.TEXTURE_2D, displacementTexture);
			gl.uniform1i(composeProgram.uniforms.u_displacement, 4);
			gl.uniform2f(composeProgram.uniforms.u_workSize, workW, workH);
			gl.uniform2f(composeProgram.uniforms.u_workOrigin, workOriginX, workOriginY);
			gl.uniform2f(composeProgram.uniforms.u_viewSize, viewSizeX, viewSizeY);
			gl.uniform2f(composeProgram.uniforms.u_viewOrigin, viewOriginX, viewOriginY);
			gl.uniform1f(composeProgram.uniforms.u_structure, state.structure);
			gl.uniform1f(composeProgram.uniforms.u_portrait, viewportH > viewportW ? 1 : 0);
			gl.uniform1f(composeProgram.uniforms.u_debugMode, debugMode);
			gl.uniform1f(composeProgram.uniforms.u_blueBg, isLandingProfile || state.background === 'blue' ? 1 : 0);
			gl.uniform1f(composeProgram.uniforms.u_opacity, state.opacity);
			gl.uniform4fv(composeProgram.uniforms.u_seedDisp, seedParams.disp);
			bindPaintedArea(composeProgram.uniforms);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.viewport(0, 0, canvasW, canvasH);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		}

		function applyBackgroundTheme() {
			if (isLandingProfile) {
				return;
			}
			var isBlue = state.background === 'blue';
			document.documentElement.classList.toggle('zdw-bid-journey-blue', isBlue);
			document.body.classList.toggle('zdw-bid-journey-blue', isBlue);
			if (bgInput) {
				bgInput.checked = isBlue;
			}
		}

		function setBackground(nextBg, shouldPersist) {
			if (isLandingProfile) {
				return;
			}
			state.background = normalizeBackground(nextBg);
			applyBackgroundTheme();
			syncDebugControls();
			if (shouldPersist) {
				saveState(state);
			}
			scrollDirty = true;
			if (!isDisabled) {
				renderFrame();
				scheduleRender();
			}
		}

		function applyEdit(shouldPersist) {
			rebuildPointUniforms();
			rebuildPaletteUniform();
			rebuildSeedUniforms();
			applyBackgroundTheme();
			if (editorSvg) {
				renderEditorSvg();
			}
			syncDebugControls();
			if (shouldPersist) {
				saveState(state);
			}
			scrollDirty = true;
			renderFrame();
			scheduleRender();
		}

		function updateSeed(nextSeed) {
			state.seed = normalizeSeed(nextSeed);
			applyEdit(true);
		}

		function selectColorStop(index) {
			activeStopIndex = Math.max(0, Math.min(PALETTE_COUNT - 1, index));
			syncDebugControls();
		}

		function updateLiquidColor(index, hex, optionalAlpha) {
			var normalized = normalizeHex(hex, null);
			if (!normalized) {
				return;
			}
			if (debugMode === 2) {
				debugMode = 1;
			}
			state.colors[index] = normalized;
			if (typeof optionalAlpha === 'number' && isFinite(optionalAlpha)) {
				state.alphas[index] = normalizeAlpha(optionalAlpha, 1);
			}
			applyEdit(true);
		}

		function updateLiquidAlpha(index, alpha) {
			if (debugMode === 2) {
				debugMode = 1;
			}
			state.alphas[index] = normalizeAlpha(alpha, 1);
			applyEdit(true);
		}

		function updateLiquidOpacity(opacity) {
			if (debugMode === 2) {
				debugMode = 1;
			}
			state.opacity = normalizeAlpha(opacity, 1);
			applyEdit(true);
		}

		function applyPaletteColors(colors, alphas, opacity) {
			if (debugMode === 2) {
				debugMode = 1;
			}
			state.colors = normalizeColors(colors);
			if (alphas !== undefined) {
				state.alphas = normalizeAlphas(alphas);
			}
			if (opacity !== undefined) {
				state.opacity = normalizeAlpha(opacity, 1);
			}
			applyEdit(true);
		}

		function addPointInViewport() {
			if (state.points.length >= MAX_POINTS) {
				return;
			}
			var scrollX = window.scrollX || window.pageXOffset || 0;
			var scrollY = window.scrollY || window.pageYOffset || 0;
			var norm = cssToNorm(scrollX + viewportW * 0.5, scrollY + viewportH * 0.45);
			state.points.push({ x: norm.x, y: norm.y, r: 240 });
			selectedIndex = state.points.length - 1;
			applyEdit(true);
		}

		function deleteSelectedPoint() {
			if (state.points.length <= 1) {
				return;
			}
			state.points.splice(selectedIndex, 1);
			selectedIndex = Math.max(0, Math.min(selectedIndex, state.points.length - 1));
			applyEdit(true);
		}

		// --- Interactive SVG Point & Perimeter Editor (only while debugMode > 0) ---

		function renderEditorSvg() {
			if (!editorSvg) {
				return;
			}
			var docW = Math.max(document.documentElement.scrollWidth, viewportW);
			var docH = Math.max(document.documentElement.scrollHeight, viewportH);
			editorSvg.setAttribute('width', String(docW));
			editorSvg.setAttribute('height', String(docH));
			editorSvg.setAttribute('viewBox', '0 0 ' + docW + ' ' + docH);

			while (editorSvg.firstChild) {
				editorSvg.removeChild(editorSvg.firstChild);
			}

			var cssScale = currentRadiusCssScale();

			for (var i = 0; i < state.points.length; i++) {
				var pt = state.points[i];
				var center = normToCss(pt.x, pt.y);
				var radiusPx = pt.r * cssScale;
				var isSelected = i === selectedIndex;

				// Wide invisible perimeter hit ring so dragging anywhere on the perimeter resizes smoothly
				editorSvg.appendChild(
					svgEl('circle', {
						cx: center.x.toFixed(1),
						cy: center.y.toFixed(1),
						r: radiusPx.toFixed(1),
						fill: 'none',
						class: 'zdw-pt-ring-hit',
						'data-kind': 'perimeter',
						'data-index': i
					})
				);

				// Visible dashed perimeter outline
				editorSvg.appendChild(
					svgEl('circle', {
						cx: center.x.toFixed(1),
						cy: center.y.toFixed(1),
						r: radiusPx.toFixed(1),
						fill: 'none',
						class: 'zdw-pt-ring' + (isSelected ? ' is-selected' : '')
					})
				);

				// Explicit perimeter drag knob at 3 o'clock
				editorSvg.appendChild(
					svgEl('circle', {
						cx: (center.x + radiusPx).toFixed(1),
						cy: center.y.toFixed(1),
						r: isSelected ? 7 : 5.5,
						class: 'zdw-bez-handle' + (isSelected ? ' is-selected' : ''),
						'data-kind': 'perimeter',
						'data-index': i
					})
				);

				// Center draggable node
				editorSvg.appendChild(
					svgEl('circle', {
						cx: center.x.toFixed(1),
						cy: center.y.toFixed(1),
						r: isSelected ? 11 : 9,
						class: 'zdw-bez-anchor' + (isSelected ? ' is-selected' : ''),
						'data-kind': 'center',
						'data-index': i
					})
				);

				var label = svgEl('text', {
					x: center.x.toFixed(1),
					y: (center.y + 3.5).toFixed(1),
					class: 'zdw-bez-label' + (isSelected ? ' is-selected' : '')
				});
				label.textContent = String(i + 1);
				editorSvg.appendChild(label);
			}
		}

		function handlePointerDown(event) {
			var target = event.target;
			if (!target || !target.getAttribute) {
				return;
			}
			var kind = target.getAttribute('data-kind');
			if (!kind) {
				return;
			}
			var index = Number(target.getAttribute('data-index'));
			if (isNaN(index) || !state.points[index]) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			selectedIndex = index;
			dragState = {
				kind: kind,
				index: index
			};
			window.addEventListener('pointermove', handlePointerMove, { passive: false });
			window.addEventListener('pointerup', handlePointerUp);
			window.addEventListener('pointercancel', handlePointerUp);
			renderEditorSvg();
			syncDebugControls();
		}

		function handlePointerMove(event) {
			if (!dragState) {
				return;
			}
			event.preventDefault();
			var pt = state.points[dragState.index];
			if (!pt) {
				return;
			}

			if (dragState.kind === 'center') {
				var norm = cssToNorm(event.pageX, event.pageY);
				pt.x = norm.x;
				pt.y = norm.y;
			} else if (dragState.kind === 'perimeter') {
				var center = normToCss(pt.x, pt.y);
				var distPx = Math.hypot(event.pageX - center.x, event.pageY - center.y);
				var unscaled = distPx / Math.max(0.1, currentRadiusCssScale());
				pt.r = Math.max(40, Math.min(480, Math.round(unscaled)));
			}

			applyEdit(false);
		}

		function handlePointerUp() {
			if (!dragState) {
				return;
			}
			window.removeEventListener('pointermove', handlePointerMove);
			window.removeEventListener('pointerup', handlePointerUp);
			window.removeEventListener('pointercancel', handlePointerUp);
			dragState = null;
			saveState(state);
		}

		function mountEditorSvg() {
			if (editorSvg) {
				return;
			}
			editorSvg = svgEl('svg', {
				class: 'zdw-bid-liquid-editor',
				'aria-hidden': 'true'
			});
			editorSvg.addEventListener('pointerdown', handlePointerDown);
			document.body.appendChild(editorSvg);
			renderEditorSvg();
		}

		function unmountEditorSvg() {
			if (!editorSvg) {
				return;
			}
			window.removeEventListener('pointermove', handlePointerMove);
			window.removeEventListener('pointerup', handlePointerUp);
			window.removeEventListener('pointercancel', handlePointerUp);
			dragState = null;
			editorSvg.removeEventListener('pointerdown', handlePointerDown);
			if (editorSvg.parentNode) {
				editorSvg.parentNode.removeChild(editorSvg);
			}
			editorSvg = null;
		}

		function syncDebugControls() {
			if (editorBtn) {
				editorBtn.classList.toggle('is-active', debugMode > 0);
				editorBtn.setAttribute('aria-pressed', String(debugMode > 0));
			}
			if (!debugBar) {
				return;
			}
			var buttons = debugBar.querySelectorAll('button[data-mode]');
			for (var b = 0; b < buttons.length; b++) {
				buttons[b].classList.toggle('is-active', Number(buttons[b].getAttribute('data-mode')) === debugMode);
			}

			var pt = state.points[selectedIndex] || state.points[0];
			var radiusInput = debugBar.querySelector('input[data-prop="radius"]');
			var radiusVal = debugBar.querySelector('[data-val="radius"]');
			var pointLabel = debugBar.querySelector('[data-val="point"]');
			if (pt && radiusInput) {
				radiusInput.value = String(Math.round(pt.r));
			}
			if (pt && radiusVal) {
				radiusVal.textContent = Math.round(pt.r) + ' px';
			}
			if (pointLabel) {
				pointLabel.textContent = 'Bod #' + (selectedIndex + 1);
			}

			var structInput = debugBar.querySelector('input[data-prop="structure"]');
			var structVal = debugBar.querySelector('[data-val="structure"]');
			if (structInput) {
				structInput.value = String(Math.round(state.structure * 100));
			}
			if (structVal) {
				structVal.textContent = Math.round(state.structure * 100) + '%';
			}

			var avoidInput = debugBar.querySelector('input[data-prop="avoidText"]');
			if (avoidInput) {
				avoidInput.checked = Boolean(state.avoidText);
			}

			var seedInput = debugBar.querySelector('input[data-prop="seed"]');
			if (seedInput && document.activeElement !== seedInput && seedInput.value !== state.seed) {
				seedInput.value = state.seed;
			}

			var addBtn = debugBar.querySelector('button[data-action="add"]');
			if (addBtn) {
				addBtn.disabled = state.points.length >= MAX_POINTS;
			}
			var delBtn = debugBar.querySelector('button[data-action="delete"]');
			if (delBtn) {
				delBtn.disabled = state.points.length <= 1;
			}

			var bgBtns = debugBar.querySelectorAll('button[data-bg-mode]');
			for (var bgIdx = 0; bgIdx < bgBtns.length; bgIdx++) {
				var bgVal = bgBtns[bgIdx].getAttribute('data-bg-mode');
				var bgActive = bgVal === state.background;
				bgBtns[bgIdx].classList.toggle('is-active', bgActive);
				bgBtns[bgIdx].setAttribute('aria-pressed', String(bgActive));
			}

			var colors = state.colors;
			var alphas = state.alphas;
			var opacity = normalizeAlpha(state.opacity, 1);
			var opacityInput = debugBar.querySelector('input[data-prop="opacity"]');
			var opacityVal = debugBar.querySelector('[data-val="opacity"]');
			if (opacityInput) {
				opacityInput.value = String(Math.round(opacity * 100));
			}
			if (opacityVal) {
				opacityVal.textContent = Math.round(opacity * 100) + '%';
			}

			var gradBarFill = debugBar.querySelector('[data-role="gradient-bar-fill"]');
			if (gradBarFill) {
				var gradStops = [];
				for (var g = 0; g < PALETTE_COUNT; g++) {
					gradStops.push(hexToRgbaCss(colors[g] || PROFILE_DEFAULT_COLORS[g], (alphas[g] !== undefined ? alphas[g] : 1) * opacity));
				}
				gradBarFill.style.background = 'linear-gradient(90deg, ' + gradStops.join(', ') + ')';
			}

			var presetBtns = debugBar.querySelectorAll('button[data-palette-preset]');
			for (var pIdx = 0; pIdx < presetBtns.length; pIdx++) {
				var pId = presetBtns[pIdx].getAttribute('data-palette-preset');
				var matched = false;
				for (var j = 0; j < PALETTE_PRESETS.length; j++) {
					if (PALETTE_PRESETS[j].id === pId) {
						matched = colorsMatch(colors, PALETTE_PRESETS[j].colors, alphas, PALETTE_PRESETS[j].alphas);
						break;
					}
				}
				presetBtns[pIdx].classList.toggle('is-active', matched);
				presetBtns[pIdx].setAttribute('aria-pressed', String(matched));
			}

			var stopRows = debugBar.querySelectorAll('.zdw-bid-liquid-stop');
			for (var sIdx = 0; sIdx < stopRows.length; sIdx++) {
				var row = stopRows[sIdx];
				var cHex = colors[sIdx] || PROFILE_DEFAULT_COLORS[sIdx];
				var cAlpha = alphas[sIdx] !== undefined ? alphas[sIdx] : 1;
				var alphaPct = Math.round(cAlpha * 100);
				row.classList.toggle('is-selected', sIdx === activeStopIndex);
				var preview = row.querySelector('.zdw-bid-liquid-stop__preview');
				if (preview) {
					preview.style.backgroundColor = hexToRgbaCss(cHex, cAlpha);
				}
				var picker = row.querySelector('input[type="color"]');
				if (picker && picker.value.toLowerCase() !== cHex) {
					picker.value = cHex;
				}
				var hexInput = row.querySelector('input[data-hex-stop]');
				if (hexInput && document.activeElement !== hexInput && hexInput.value.toLowerCase() !== cHex) {
					hexInput.value = cHex;
				}
				var alphaInput = row.querySelector('input[data-alpha-stop]');
				if (alphaInput && Number(alphaInput.value) !== alphaPct) {
					alphaInput.value = String(alphaPct);
				}
				var alphaOut = row.querySelector('[data-alpha-val]');
				if (alphaOut) {
					alphaOut.textContent = alphaPct + '%';
				}
			}
		}

		function buildPaletteSectionHtml() {
			var presetHtml = PALETTE_PRESETS.map(function (preset) {
				return '<button type="button" data-palette-preset="' + preset.id + '">' + preset.label + '</button>';
			}).join('');

			var swatchesHtml = PALETTE_SWATCHES.map(function (swatch) {
				return (
					'<button type="button" class="zdw-bid-liquid-swatch" data-swatch-color="' +
					swatch.hex +
					'" style="background-color:' +
					swatch.hex +
					'" title="' +
					swatch.name +
					' (' +
					swatch.hex +
					') – přiřadit k vybrané barvě" aria-label="' +
					swatch.name +
					'"></button>'
				);
			}).join('');

			var stopsHtml = '';
			for (var i = 0; i < PALETTE_COUNT; i++) {
				var cHex = state.colors[i] || PROFILE_DEFAULT_COLORS[i];
				var cAlpha = state.alphas[i] !== undefined ? state.alphas[i] : 1;
				var alphaPct = Math.round(cAlpha * 100);
				var minisHtml = ROW_MINI_SWATCHES.map(function (swatch) {
					return (
						'<button type="button" class="zdw-bid-liquid-mini-swatch" data-mini-stop="' +
						i +
						'" data-mini-color="' +
						swatch.hex +
						'" style="background-color:' +
						swatch.hex +
						'" title="' +
						swatch.name +
						' (' +
						swatch.hex +
						')" aria-label="Barva ' +
						(i + 1) +
						': ' +
						swatch.name +
						'"></button>'
					);
				}).join('');

				stopsHtml +=
					'<div class="zdw-bid-liquid-stop' +
					(i === activeStopIndex ? ' is-selected' : '') +
					'" data-stop-row="' +
					i +
					'">' +
					'<span class="zdw-bid-liquid-stop__label">#' +
					(i + 1) +
					'</span>' +
					'<div class="zdw-bid-liquid-stop__picker" title="Vybrat barvu ' +
					(i + 1) +
					'">' +
					'<div class="zdw-bid-liquid-stop__preview" style="background-color:' +
					hexToRgbaCss(cHex, cAlpha) +
					'"></div>' +
					'<input type="color" class="zdw-bid-liquid-stop__picker-input" data-color-stop="' +
					i +
					'" value="' +
					cHex +
					'" aria-label="Barva liquidu ' +
					(i + 1) +
					'">' +
					'</div>' +
					'<input type="text" class="zdw-bid-liquid-stop__hex" data-hex-stop="' +
					i +
					'" value="' +
					cHex +
					'" maxlength="9" spellcheck="false" autocomplete="off" title="HEX (#rrggbb nebo #rrggbbaa)" aria-label="HEX kód barvy ' +
					(i + 1) +
					'">' +
					'<div class="zdw-bid-liquid-stop__alpha" title="Alpha (průhlednost) barvy ' +
					(i + 1) +
					'">' +
					'<input type="range" min="0" max="100" step="1" value="' +
					alphaPct +
					'" data-alpha-stop="' +
					i +
					'" aria-label="Alpha barvy ' +
					(i + 1) +
					'">' +
					'<output data-alpha-val="' +
					i +
					'">' +
					alphaPct +
					'%</output>' +
					'</div>' +
					'<div class="zdw-bid-liquid-stop__minis" title="Rychlý výběr z Figma palety">' +
					minisHtml +
					'</div>' +
					'</div>';
			}

			var bgSwitchHtml = isLandingProfile
				? ''
				: '<div class="zdw-bid-liquid-palette-bar">' +
					'<span class="zdw-bid-liquid-palette-title">Pozadí stránky</span>' +
					'</div>' +
					'<div class="zdw-bid-liquid-debug__actions zdw-bid-liquid-bg-switch">' +
					'<button type="button" data-bg-mode="dark"><i style="background:#1f1f1f"></i>Ne-černá</button>' +
					'<button type="button" data-bg-mode="blue"><i style="background:#9fbaff"></i>Modrá (Figma)</button>' +
					'</div>';

			return (
				'<details class="zdw-bid-liquid-debug__section" open>' +
				'<summary>Barvy liquidu (paleta &amp; alpha)</summary>' +
				'<div class="zdw-bid-liquid-debug__section-body">' +
				bgSwitchHtml +
				'<div class="zdw-bid-liquid-gradient-bar" aria-hidden="true"><div class="zdw-bid-liquid-gradient-bar__fill" data-role="gradient-bar-fill"></div></div>' +
				'<div class="zdw-bid-liquid-debug__sliders">' +
				'<label><span>Alpha</span> <input type="range" min="0" max="100" step="1" data-prop="opacity"> <output data-val="opacity">100%</output></label>' +
				'</div>' +
				'<div class="zdw-bid-liquid-debug__actions">' +
				presetHtml +
				'</div>' +
				'<div class="zdw-bid-liquid-palette-bar">' +
				'<span class="zdw-bid-liquid-palette-title">Paleta barev (klik přiřadí vybrané barvě)</span>' +
				'<button type="button" class="zdw-bid-liquid-mini-action" data-action="reset-colors" title="Vrátit výchozí Figma paletu a alphu">Výchozí</button>' +
				'</div>' +
				'<div class="zdw-bid-liquid-swatches">' +
				swatchesHtml +
				'</div>' +
				'<div class="zdw-bid-liquid-stops">' +
				stopsHtml +
				'</div>' +
				'</div>' +
				'</details>'
			);
		}

		function syncDebugUI() {
			if (editorBtn) {
				editorBtn.classList.toggle('is-active', debugMode > 0);
				editorBtn.setAttribute('aria-pressed', String(debugMode > 0));
			}
			if (debugMode === 0) {
				unmountEditorSvg();
				if (debugBar && debugBar.parentNode) {
					debugBar.parentNode.removeChild(debugBar);
				}
				debugBar = null;
				return;
			}

			mountEditorSvg();

			if (!debugBar) {
				debugBar = document.createElement('div');
				debugBar.className = 'zdw-bid-liquid-debug';
				debugBar.innerHTML =
					'<div class="zdw-bid-liquid-debug__head">' +
					'<strong>' +
					(isLandingProfile ? 'Editor liquidu – Best in Design' : 'Editor liquidu (pozice &amp; barvy)') +
					'</strong>' +
					'<span class="zdw-bid-liquid-debug__hint">Táhni střed bodu pro přesun · obvod pro perimetr · dole ladíš barvy</span>' +
					'</div>' +
					'<div class="zdw-bid-liquid-debug__legend">' +
					'<span><i style="background:' +
					(isLandingProfile ? '#2d3b63' : '#61baff') +
					'"></i>Zdrojová plocha</span>' +
					'<span><i style="background:#fd3d62"></i>Textová zóna</span>' +
					'<span><i style="background:' +
					(isLandingProfile ? '#4d6cd6' : 'rgba(255,255,255,.65)') +
					'"></i>Perimetr</span>' +
					'</div>' +
					'<div class="zdw-bid-liquid-debug__actions">' +
					'<button type="button" data-mode="1">Liquid + plocha</button>' +
					'<button type="button" data-mode="3">Liquid + body</button>' +
					'<button type="button" data-mode="2">Jen plocha</button>' +
					'<button type="button" data-mode="0">Zavřít</button>' +
					'</div>' +
					'<details class="zdw-bid-liquid-debug__section" open>' +
					'<summary>Pozice a tvar</summary>' +
					'<div class="zdw-bid-liquid-debug__section-body">' +
					'<div class="zdw-bid-liquid-seed-row">' +
					'<span>Seed</span>' +
					'<input type="text" data-prop="seed" value="' +
					state.seed.replace(/"/g, '&quot;') +
					'" maxlength="64" spellcheck="false" autocomplete="off" aria-label="Seed podoby liquidu">' +
					'<button type="button" class="zdw-bid-liquid-mini-action" data-action="random-seed" title="Vygenerovat náhodný seed">🎲</button>' +
					'</div>' +
					'<div class="zdw-bid-liquid-debug__sliders">' +
					'<label><span data-val="point">Bod #1</span> <input type="range" min="40" max="480" step="2" data-prop="radius"> <output data-val="radius">265 px</output></label>' +
					'<label><span>Dutiny</span> <input type="range" min="0" max="100" step="1" data-prop="structure"> <output data-val="structure">50%</output></label>' +
					'<label class="zdw-bid-liquid-debug__check"><input type="checkbox" data-prop="avoidText"> Vyhýbat se textům</label>' +
					'</div>' +
					'<div class="zdw-bid-liquid-debug__actions">' +
					'<button type="button" data-action="add">+ Přidat bod</button>' +
					'<button type="button" data-action="delete">Smazat bod</button>' +
					'</div>' +
					'</div>' +
					'</details>' +
					buildPaletteSectionHtml() +
					'<div class="zdw-bid-liquid-debug__actions zdw-bid-liquid-debug__foot">' +
					'<button type="button" data-action="copy">Kopírovat JSON</button>' +
					'<button type="button" data-action="reset">Reset vše</button>' +
					'</div>';

				debugBar.addEventListener('click', function (event) {
					var target = event.target;
					var btn = target && target.closest ? target.closest('button') : null;
					if (btn) {
						if (btn.hasAttribute('data-mode')) {
							setDebugMode(Number(btn.getAttribute('data-mode')) || 0);
							return;
						}
						if (btn.hasAttribute('data-bg-mode')) {
							setBackground(btn.getAttribute('data-bg-mode'), true);
							return;
						}
						if (btn.hasAttribute('data-palette-preset')) {
							var presetId = btn.getAttribute('data-palette-preset');
							for (var p = 0; p < PALETTE_PRESETS.length; p++) {
								if (PALETTE_PRESETS[p].id === presetId) {
									applyPaletteColors(PALETTE_PRESETS[p].colors, PALETTE_PRESETS[p].alphas, PALETTE_PRESETS[p].opacity);
									return;
								}
							}
							return;
						}
						if (btn.hasAttribute('data-swatch-color')) {
							updateLiquidColor(activeStopIndex, btn.getAttribute('data-swatch-color'));
							return;
						}
						if (btn.hasAttribute('data-mini-color')) {
							var miniIdx = Number(btn.getAttribute('data-mini-stop'));
							if (!isNaN(miniIdx)) {
								activeStopIndex = miniIdx;
								updateLiquidColor(miniIdx, btn.getAttribute('data-mini-color'));
							}
							return;
						}

						var action = btn.getAttribute('data-action');
						if (action === 'add') {
							addPointInViewport();
						} else if (action === 'delete') {
							deleteSelectedPoint();
						} else if (action === 'random-seed') {
							updateSeed('seed-' + Math.floor(1000 + Math.random() * 9000));
						} else if (action === 'reset-colors') {
							applyPaletteColors(PROFILE_DEFAULT_COLORS, PROFILE_DEFAULT_ALPHAS, DEFAULT_OPACITY);
						} else if (action === 'reset') {
							clearSavedState();
							state = cloneState(DEFAULT_STATE);
							selectedIndex = 0;
							activeStopIndex = 0;
							applyEdit(false);
						} else if (action === 'copy') {
							var rounded = {
								profile: isLandingProfile ? 'landing' : 'journey',
								seed: state.seed,
								structure: Number(state.structure.toFixed(2)),
								avoidText: state.avoidText,
								opacity: Number(normalizeAlpha(state.opacity, DEFAULT_OPACITY).toFixed(2)),
								colors: state.colors.slice(),
								alphas: state.alphas.map(function (a) {
									return Number(normalizeAlpha(a, 1).toFixed(2));
								}),
								points: state.points.map(function (pt) {
									return {
										x: Number(pt.x.toFixed(3)),
										y: Number(pt.y.toFixed(3)),
										r: Math.round(pt.r)
									};
								})
							};
							if (!isLandingProfile) {
								rounded.background = state.background;
							}
							var json = JSON.stringify(rounded, null, 2);
							if (navigator.clipboard && navigator.clipboard.writeText) {
								navigator.clipboard.writeText(json).then(function () {
									var orig = btn.textContent;
									btn.textContent = 'Zkopírováno ✓';
									window.setTimeout(function () {
										btn.textContent = orig;
									}, 1600);
								}).catch(function () {
									window.prompt('Zkopíruj JSON bodů a barev:', json);
								});
							} else {
								window.prompt('Zkopíruj JSON bodů a barev:', json);
							}
						}
						return;
					}

					var stopRow = target && target.closest ? target.closest('[data-stop-row]') : null;
					if (stopRow) {
						var idx = Number(stopRow.getAttribute('data-stop-row'));
						if (!isNaN(idx)) {
							selectColorStop(idx);
						}
					}
				});

				debugBar.addEventListener('input', function (event) {
					var input = event.target;
					if (!input || !input.getAttribute) {
						return;
					}
					if (input.hasAttribute('data-color-stop')) {
						var stopIdx = Number(input.getAttribute('data-color-stop'));
						if (!isNaN(stopIdx)) {
							activeStopIndex = stopIdx;
							updateLiquidColor(stopIdx, input.value);
						}
						return;
					}
					if (input.hasAttribute('data-hex-stop')) {
						var hexIdx = Number(input.getAttribute('data-hex-stop'));
						if (!isNaN(hexIdx)) {
							activeStopIndex = hexIdx;
							var parsed = parseHexWithOptionalAlpha(input.value);
							if (parsed) {
								updateLiquidColor(hexIdx, parsed.hex, parsed.alpha);
							}
						}
						return;
					}
					if (input.hasAttribute('data-alpha-stop')) {
						var alphaIdx = Number(input.getAttribute('data-alpha-stop'));
						if (!isNaN(alphaIdx)) {
							activeStopIndex = alphaIdx;
							updateLiquidAlpha(alphaIdx, Number(input.value) / 100);
						}
						return;
					}
					var prop = input.getAttribute('data-prop');
					if (prop === 'seed') {
						if (input.value.trim() !== '') {
							updateSeed(input.value);
						}
					} else if (prop === 'radius' && state.points[selectedIndex]) {
						state.points[selectedIndex].r = Number(input.value);
						applyEdit(true);
					} else if (prop === 'structure') {
						state.structure = Number(input.value) / 100;
						applyEdit(true);
					} else if (prop === 'opacity') {
						updateLiquidOpacity(Number(input.value) / 100);
					} else if (prop === 'avoidText') {
						state.avoidText = Boolean(input.checked);
						applyEdit(true);
					}
				});

				debugBar.addEventListener('focusout', function (event) {
					var input = event.target;
					if (input && input.hasAttribute && input.hasAttribute('data-hex-stop')) {
						var hexIdx = Number(input.getAttribute('data-hex-stop'));
						if (!isNaN(hexIdx) && state.colors[hexIdx]) {
							input.value = state.colors[hexIdx];
						}
					} else if (input && input.getAttribute && input.getAttribute('data-prop') === 'seed') {
						if (input.value.trim() === '') {
							updateSeed(DEFAULT_SEED);
						}
						input.value = state.seed;
					}
				});

				document.body.appendChild(debugBar);
			}

			syncDebugControls();
		}

		function setDebugMode(nextMode) {
			debugMode = nextMode;
			syncDebugUI();
			scrollDirty = true;
			renderFrame();
			scheduleRender();
		}

		function stopLoop() {
			if (rafId) {
				window.cancelAnimationFrame(rafId);
				rafId = 0;
			}
		}

		function tick(now) {
			rafId = 0;
			if (destroyed || document.hidden || !isVisible) {
				return;
			}

			var currentScrollY = window.scrollY || window.pageYOffset || 0;
			var didScroll = scrollDirty || currentScrollY !== lastScrollY;

			if (isReducedMotion) {
				if (didScroll) {
					renderFrame();
				}
				return;
			}

			if (lastRenderMs === 0) {
				lastRenderMs = now;
			}
			var deltaMs = now - lastRenderMs;

			if (didScroll || deltaMs >= IDLE_FRAME_MS) {
				var clampedDt = Math.min(Math.max(deltaMs, 0), 100) / 1000;
				lastRenderMs = now;
				ambientTime += clampedDt * AMBIENT_SPEED;
				renderFrame();
			}

			rafId = window.requestAnimationFrame(tick);
		}

		function scheduleRender() {
			if (destroyed || isDisabled || document.hidden || !isVisible || rafId) {
				return;
			}
			rafId = window.requestAnimationFrame(tick);
		}

		function startLoop() {
			if (destroyed || isDisabled || document.hidden || !isVisible) {
				return;
			}
			if (isReducedMotion) {
				if (scrollDirty) {
					scheduleRender();
				}
				return;
			}
			if (!rafId) {
				lastRenderMs = 0;
				rafId = window.requestAnimationFrame(tick);
			}
		}

		function positionLiquidToggle() {
			if (!toggleEl) {
				return;
			}
			if (window.innerWidth <= 640) {
				toggleEl.style.right = '';
				return;
			}
			var manageBtn = document.querySelector('#cmplz-manage-consent .cmplz-manage-consent');
			var banner = document.querySelector('#cmplz-cookiebanner-container .cmplz-cookiebanner:not(.cmplz-hidden)');
			var anchor = null;
			if (banner) {
				var br = banner.getBoundingClientRect();
				if (br.width > 0 && br.height > 0 && window.getComputedStyle(banner).display !== 'none') {
					anchor = br;
				}
			}
			if (!anchor && manageBtn) {
				var mr = manageBtn.getBoundingClientRect();
				if (mr.width > 0 && mr.height > 0 && window.getComputedStyle(manageBtn).display !== 'none') {
					anchor = mr;
				}
			}
			if (anchor && anchor.left > 160) {
				toggleEl.style.right = Math.round(window.innerWidth - anchor.left + 12) + 'px';
			} else {
				toggleEl.style.right = '';
			}
		}

		function setDisabled(nextDisabled, shouldPersist) {
			isDisabled = Boolean(nextDisabled);
			if (toggleInput) {
				toggleInput.checked = !isDisabled;
			}
			document.body.classList.toggle('zdw-bid-liquid-off', isDisabled);
			if (shouldPersist) {
				try {
					window.localStorage.setItem(DISABLED_STORAGE_KEY, isDisabled ? '1' : '0');
				} catch (e) {
					// Ignore storage restrictions.
				}
			}
			if (isDisabled) {
				stopLoop();
				canvas.classList.remove('is-ready');
				if (debugMode > 0) {
					setDebugMode(0);
				}
			} else {
				if (updateViewportMetrics()) {
					scrollDirty = true;
					renderFrame();
					canvas.classList.add('is-ready');
					startLoop();
				}
			}
		}

		function setFlipped(nextFlipped, shouldPersist) {
			isFlipped = Boolean(nextFlipped);
			if (flipInput) {
				flipInput.checked = isFlipped;
			}
			document.body.classList.toggle('zdw-bid-journey-flip', isFlipped);
			if (shouldPersist) {
				try {
					window.localStorage.setItem(FLIP_STORAGE_KEY, isFlipped ? '1' : '0');
				} catch (e) {
					// Ignore storage restrictions.
				}
			}
			measureLayout();
			scrollDirty = true;
			if (!isDisabled) {
				renderFrame();
				scheduleRender();
			}
		}

		function mountLiquidToggle() {
			if (isLandingProfile || toggleEl) {
				return;
			}
			var isEn = /^en\b/i.test((document.documentElement && document.documentElement.lang) || '');
			var bar = document.createElement('div');
			bar.className = 'zdw-bid-liquid-controls';

			var flipLabel = document.createElement('label');
			flipLabel.className = 'zdw-bid-liquid-toggle zdw-bid-liquid-toggle--flip';
			var fInput = document.createElement('input');
			fInput.type = 'checkbox';
			fInput.className = 'zdw-bid-liquid-toggle__input';
			fInput.checked = isFlipped;
			fInput.addEventListener('change', function () {
				setFlipped(fInput.checked, true);
			});
			var fText = document.createElement('span');
			fText.textContent = isEn ? 'Flip sides' : 'Prohodit strany';
			flipLabel.appendChild(fInput);
			flipLabel.appendChild(fText);

			var label = document.createElement('label');
			label.className = 'zdw-bid-liquid-toggle';
			var input = document.createElement('input');
			input.type = 'checkbox';
			input.className = 'zdw-bid-liquid-toggle__input';
			input.checked = !isDisabled;
			input.addEventListener('change', function () {
				setDisabled(!input.checked, true);
			});
			var text = document.createElement('span');
			text.textContent = 'Liquid';
			label.appendChild(input);
			label.appendChild(text);

			var bgLabel = document.createElement('label');
			bgLabel.className = 'zdw-bid-liquid-toggle zdw-bid-liquid-toggle--bg';
			var bInput = document.createElement('input');
			bInput.type = 'checkbox';
			bInput.className = 'zdw-bid-liquid-toggle__input';
			bInput.checked = state.background === 'blue';
			bInput.addEventListener('change', function () {
				setBackground(bInput.checked ? 'blue' : 'dark', true);
			});
			var bText = document.createElement('span');
			bText.textContent = isEn ? 'Blue bg' : 'Modré pozadí';
			bgLabel.appendChild(bInput);
			bgLabel.appendChild(bText);

			var eBtn = document.createElement('button');
			eBtn.type = 'button';
			eBtn.className = 'zdw-bid-liquid-toggle zdw-bid-liquid-toggle--editor';
			eBtn.textContent = isEn ? 'Edit liquid' : 'Editor liquidu';
			eBtn.setAttribute('aria-pressed', String(debugMode > 0));
			eBtn.classList.toggle('is-active', debugMode > 0);
			eBtn.addEventListener('click', function () {
				if (isDisabled) {
					setDisabled(false, true);
				}
				setDebugMode(debugMode > 0 ? 0 : 1);
			});

			bar.appendChild(eBtn);
			bar.appendChild(bgLabel);
			bar.appendChild(flipLabel);
			bar.appendChild(label);
			document.body.appendChild(bar);
			toggleEl = bar;
			toggleInput = input;
			flipInput = fInput;
			bgInput = bInput;
			editorBtn = eBtn;

			positionLiquidToggle();
			window.setTimeout(positionLiquidToggle, 600);
			window.setTimeout(positionLiquidToggle, 1800);

			if (typeof window.MutationObserver === 'function') {
				cmplzObserver = new window.MutationObserver(positionLiquidToggle);
				var cmplzNodes = [
					document.getElementById('cmplz-manage-consent'),
					document.getElementById('cmplz-cookiebanner-container')
				];
				for (var c = 0; c < cmplzNodes.length; c++) {
					if (cmplzNodes[c]) {
						cmplzObserver.observe(cmplzNodes[c], {
							attributes: true,
							subtree: true,
							attributeFilter: ['class', 'style']
						});
					}
				}
			}
		}

		function handleScroll() {
			scrollDirty = true;
			scheduleRender();
		}

		function handleResize() {
			positionLiquidToggle();
			if (!isDisabled && updateViewportMetrics()) {
				scheduleRender();
			}
		}

		function handleVisibility() {
			if (document.hidden) {
				stopLoop();
			} else {
				scrollDirty = true;
				startLoop();
			}
		}

		function handleKeydown(event) {
			var tag = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : '';
			if (tag === 'input' || tag === 'textarea' || tag === 'select' || (event.target && event.target.isContentEditable)) {
				return;
			}

			if (event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && (event.key || '').toLowerCase() === 'l') {
				event.preventDefault();
				var order = [0, 1, 3, 2];
				var curIdx = order.indexOf(debugMode);
				setDebugMode(order[(curIdx + 1) % order.length]);
				return;
			}

			if (debugMode > 0 && (event.key === 'Delete' || event.key === 'Backspace')) {
				event.preventDefault();
				deleteSelectedPoint();
			}
		}

		function handleMotionChange(event) {
			isReducedMotion = Boolean(event.matches);
			scrollDirty = true;
			if (isReducedMotion) {
				stopLoop();
				scheduleRender();
			} else {
				startLoop();
			}
		}

		var intersectionObserver = null;
		if (typeof window.IntersectionObserver === 'function') {
			intersectionObserver = new window.IntersectionObserver(
				function (entries) {
					isVisible = Boolean(entries[0] && entries[0].isIntersecting);
					if (isVisible) {
						scrollDirty = true;
						startLoop();
					} else {
						stopLoop();
					}
				},
				{ threshold: 0 }
			);
		}

		var resizeObserver = null;
		if (typeof window.ResizeObserver === 'function') {
			resizeObserver = new window.ResizeObserver(function () {
				measureLayout();
				scrollDirty = true;
				scheduleRender();
			});
		}

		function cleanup() {
			if (destroyed) {
				return;
			}
			destroyed = true;
			stopLoop();
			unmountEditorSvg();
			if (intersectionObserver) {
				intersectionObserver.disconnect();
			}
			if (resizeObserver) {
				resizeObserver.disconnect();
			}
			window.removeEventListener('resize', handleResize);
			window.removeEventListener('scroll', handleScroll);
			window.removeEventListener('keydown', handleKeydown);
			document.removeEventListener('visibilitychange', handleVisibility);
			if (debugBar && debugBar.parentNode) {
				debugBar.parentNode.removeChild(debugBar);
				debugBar = null;
			}
			if (cmplzObserver) {
				cmplzObserver.disconnect();
				cmplzObserver = null;
			}
			if (toggleEl && toggleEl.parentNode) {
				toggleEl.parentNode.removeChild(toggleEl);
				toggleEl = null;
				toggleInput = null;
				flipInput = null;
				bgInput = null;
				editorBtn = null;
			}
			document.documentElement.classList.remove('zdw-bid-journey-blue');
			document.body.classList.remove('zdw-bid-journey-blue');
			if (motionQuery && motionQuery.removeEventListener) {
				motionQuery.removeEventListener('change', handleMotionChange);
			}
			if (!gl.isContextLost()) {
				gl.deleteProgram(sourceProgram.program);
				gl.deleteProgram(waveProgram.program);
				gl.deleteProgram(filterProgram.program);
				gl.deleteProgram(composeProgram.program);
				for (var t = 0; t < targets.length; t++) {
					gl.deleteTexture(targets[t].texture);
					gl.deleteFramebuffer(targets[t].framebuffer);
				}
				gl.deleteTexture(displacementTexture);
				gl.deleteVertexArray(vao);
			}
			if (canvas.parentNode) {
				canvas.parentNode.removeChild(canvas);
			}
		}

		canvas.addEventListener('webglcontextlost', function (event) {
			event.preventDefault();
			stopLoop();
			canvas.classList.remove('is-ready');
		});

		decodeDisplacementMap(config.mapUrl)
			.then(function (pixels) {
				if (destroyed || gl.isContextLost()) {
					return;
				}

				gl.activeTexture(gl.TEXTURE4);
				gl.bindTexture(gl.TEXTURE_2D, displacementTexture);
				gl.texImage2D(
					gl.TEXTURE_2D,
					0,
					gl.RGBA8,
					MAP_WIDTH,
					MAP_HEIGHT,
					0,
					gl.RGBA,
					gl.UNSIGNED_BYTE,
					pixels
				);

				document.body.insertBefore(canvas, document.body.firstChild);
				if (!isLandingProfile && isFlipped) {
					document.body.classList.add('zdw-bid-journey-flip');
				}
				rebuildPaletteUniform();
				rebuildSeedUniforms();
				applyBackgroundTheme();
				mountLiquidToggle();
				if (!updateViewportMetrics()) {
					return;
				}
				syncDebugUI();

				if (isDisabled) {
					document.body.classList.add('zdw-bid-liquid-off');
				} else {
					renderFrame();
					window.requestAnimationFrame(function () {
						if (!destroyed && !isDisabled) {
							canvas.classList.add('is-ready');
						}
					});
				}

				window.addEventListener('resize', handleResize, { passive: true });
				window.addEventListener('scroll', handleScroll, { passive: true });
				window.addEventListener('keydown', handleKeydown);
				document.addEventListener('visibilitychange', handleVisibility);
				window.addEventListener('pagehide', cleanup, { once: true });
				if (motionQuery && motionQuery.addEventListener) {
					motionQuery.addEventListener('change', handleMotionChange);
				}
				if (intersectionObserver) {
					intersectionObserver.observe(mainEl);
				}
				if (resizeObserver) {
					if (isLandingProfile) {
						resizeObserver.observe(mainEl);
						for (var ob = 0; ob < lightBandEls.length; ob++) {
							resizeObserver.observe(lightBandEls[ob]);
						}
					} else if (journeyEl) {
						resizeObserver.observe(journeyEl);
					}
				}
				if (document.fonts && document.fonts.ready) {
					document.fonts.ready.then(function () {
						if (!destroyed) {
							measureLayout();
							scrollDirty = true;
							scheduleRender();
						}
					});
				}

				startLoop();
			})
			.catch(function () {
				cleanup();
			});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init, { once: true });
	} else {
		init();
	}
})();

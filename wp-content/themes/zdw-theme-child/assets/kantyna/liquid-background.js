/* Adapted from ZDW-liquid/src/shaders.js (Figma Glass calibration).
 * Optical calculations are preserved; placement, purple tint and alpha are page-specific.
 * Static artwork: render only on resize, with a 2D fallback. No animation loop.
 */
(() => {
'use strict';
// Keep the calibrated glass grid available for a later design iteration.
const GLASS_ENABLED = false;
const vertex = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0., 1.);
}`;
const fragment = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_scene;
uniform sampler2D u_tiles;
uniform vec2 u_cssSize;
uniform vec2 u_tileCount;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform float u_glass;
uniform float u_size;
uniform float u_zoom;
uniform float u_blur;
uniform float u_strength;
uniform float u_aberration;
uniform float u_interaction;
uniform float u_light;
const bool LIQUID_VISIBLE = true;

vec4 liquidMaterial(vec2 uv) {
  // Native AE poster: RGB in the upper half, opacity in the lower half.
  if(any(lessThan(uv,vec2(0.))) || any(greaterThan(uv,vec2(1.)))) return vec4(0.);
  vec3 rgb=texture(u_scene,vec2(uv.x,uv.y*.5)).rgb;
  float alpha=texture(u_scene,vec2(uv.x,.5+uv.y*.5)).r;
  // Let a small part of the native color flow become near-white highlights.
  float highlight=smoothstep(.63,.67,rgb.r-rgb.b);
  vec3 color=mix(vec3(94.,61.,239.)/255.,vec3(248./255.),highlight);
  return vec4(color,alpha*(.50+dot(rgb,vec3(.2126,.7152,.0722))*.15));
}
vec4 liquidIsland(vec2 p,vec2 center,float width,float angle) {
  // Rotate in CSS pixels, then scale both native axes by the same factor.
  // The lower half of the packed image contains opacity, not more artwork.
  vec2 packedSize=vec2(textureSize(u_scene,0));
  vec2 dimensions=vec2(width,width*packedSize.y*.5/packedSize.x);
  float c=cos(angle),s=sin(angle);
  vec2 q=mat2(c,-s,s,c)*(p-center);
  return liquidMaterial(q/(dimensions*1.95)+.5);
}
vec4 strongestLiquid(vec4 a,vec4 b) {
  return a.a>b.a ? a : b;
}
vec3 sampleScene(vec2 uv) {
  if(!LIQUID_VISIBLE) return vec3(225./255.);
  // Continuous liquid islands span both the glass and the clear gaps.
  // Each native poster has transparent margins, so no crop/repeat seams appear.
  vec2 p=vec2(uv.x,1.-uv.y)*u_cssSize;
  // Share the grid's centered reference composition as the viewport expands.
  float compositionWidth=min(u_cssSize.x,945.);
  p.x-=(u_cssSize.x-compositionWidth)*.5;
  vec4 liquid=liquidIsland(p,vec2(-15.,110.),760.,-.28);
  liquid=strongestLiquid(liquid,liquidIsland(p,vec2(compositionWidth+90.,u_cssSize.y*.31+120.),900.,.90));
  liquid=strongestLiquid(liquid,liquidIsland(p,vec2(-140.,u_cssSize.y*.61+140.),730.,-.95));
  liquid=strongestLiquid(liquid,liquidIsland(p,vec2(compositionWidth-50.,u_cssSize.y*.94+20.),820.,.33));
  return mix(vec3(225./255.),liquid.rgb,liquid.a);
}
vec3 sampleGlassBlur(vec2 uv, vec2 d) {
  if(dot(d,d)<1e-12) return sampleScene(uv);
  vec3 color=sampleScene(uv)*4.;
  color+=(sampleScene(uv+vec2(d.x,0.))+sampleScene(uv-vec2(d.x,0.))+
          sampleScene(uv+vec2(0.,d.y))+sampleScene(uv-vec2(0.,d.y)))*2.;
  color+=sampleScene(uv+d)+sampleScene(uv-d)+sampleScene(uv+vec2(d.x,-d.y))+sampleScene(uv+vec2(-d.x,d.y));
  return color/16.;
}
void main() {
  vec3 original=sampleScene(v_uv);
  if(u_glass<.5) { outColor=vec4(original,.65); return; }
  // Anchor the grid to the section's top so its first row is always complete.
  vec2 gridOffset=vec2(0.,u_tileCount.y*u_size-u_cssSize.y);
  vec2 p=v_uv*u_cssSize+gridOffset;
  vec2 tile=floor(p/u_size);
  vec2 maskUv=(tile+.5)/u_tileCount;
  if(texture(u_tiles,maskUv).r<.5) { outColor=vec4(original,.65); return; }
  vec2 center=(tile+.5)*u_size;
  vec2 local=(p-center)/u_size;
  vec2 referenceToUv=1./u_cssSize;
  vec2 tileUv=(center-gridOffset)*referenceToUv;
  float hover=exp(-dot(v_uv-u_pointer,v_uv-u_pointer)*30.)*u_interaction;
  float magnify=u_zoom;
  float strength=u_strength;

  // Measured from native Figma Glass exports (Refraction/Depth/Splay 100).
  // Box distance controls the falloff; the ray points toward the tile center.
  // Independent x/y bevels cannot reproduce Figma's curved corner lobes.
  vec2 edgeDistance=.5-abs(local);
  vec2 radial=local/max(length(local),.00001);
  float bevelDepth=min(100.,u_size*.5);
  float inset=min(edgeDistance.x,edgeDistance.y)*u_size;
  float curvature=pow(max(1.-inset/bevelDepth,0.),3.3);
  vec2 bend=-radial*curvature*(bevelDepth*1.045)*strength*referenceToUv;

  // Surface normal is used only for the directional rim lighting.
  float bevelWidth=bevelDepth/u_size;
  vec2 t=clamp(edgeDistance/bevelWidth,0.,1.);
  vec2 u=1.-t;
  vec2 height=pow(max(vec2(.0001),1.-u*u*u*u),vec2(.25));
  vec2 gradient=u*u*u/(height*height*height);
  vec2 slope=sign(local)*gradient*height.yx;
  vec3 normal=normalize(vec3(slope,1.));
  vec2 baseUv=tileUv+(v_uv-tileUv)/magnify;
  vec2 uv=baseUv+bend;
  // Figma's Frost 0 still softens fine detail. A small Gaussian footprint
  // smooths the source separately for each refracted wavelength, preserving
  // the RGB separation. Reference pixels keep it consistent on resize/DPR.
  // Keep the flat center crisp; stronger softening follows the curved rim.
  // Independent blur variances add; zero strength + zero frost stays exact.
  float opticalBlur=mix(.75,1.4,smoothstep(0.,.35,curvature))*clamp(strength,0.,1.);
  vec2 d=sqrt(u_blur*u_blur+opticalBlur*opticalBlur)*referenceToUv;
  vec3 color;
  if(u_aberration>0.) {
    // Dispersion follows the refracted ray, so flat glass cannot separate RGB.
    // Integrate a small wavelength band per channel instead of three razor-
    // thin copies. The band collapses with the bend toward the flat center.
    vec2 split=bend*.098*u_aberration;
    color=vec3(0.);
    for(int i=-2;i<=2;i++) {
      float weight=i==0 ? .375 : (abs(i)==1 ? .25 : .0625);
      vec2 spread=split*(float(i)*.30);
      color+=vec3(sampleGlassBlur(uv+split+spread,d).r,
                  sampleGlassBlur(uv+spread,d).g,
                  sampleGlassBlur(uv-split+spread,d).b)*weight;
    }
    // Match the fringe contrast of the Figma exports: spectral highlights
    // need more attenuation than dark fringes. Blend each channel toward
    // the unsplit refracted ray, rather than grading the source palette.
    // Constant colors and zero bend have zero delta and remain unchanged.
    vec3 neutral=sampleGlassBlur(uv,d);
    vec3 spectralDelta=color-neutral;
    color-=max(spectralDelta,vec3(0.))*.28;
  } else color=sampleGlassBlur(uv,d);

  // Reflection and inner shade reveal thickness even over a uniform backdrop.
  // Light follows the pointer gently, while the grid itself stays anchored.
  vec2 lightDirection=normalize(vec2(-.65,.76)+(u_pointer-.5)*hover*.8);
  vec2 edgeNormal=slope/max(length(slope),.0001);
  float facing=dot(edgeNormal,lightDirection);
  vec2 outerBevel=1.-smoothstep(vec2(0.),vec2(.10),edgeDistance);
  float edgeAmount=max(outerBevel.x,outerBevel.y);
  float fresnel=.04+.96*pow(1.-normal.z,5.);
  float shade=edgeAmount*(.045+.12*max(-facing,0.))*strength*u_light;
  color*=1.-shade;
  float reflection=((fresnel-.04)*.32+edgeAmount*.11*max(facing,0.))*strength*u_light;
  color=mix(color,vec3(.96,.98,1.),clamp(reflection,0.,.65));

  // A fine outer glint and a broader inner caustic, rather than a flat border.
  float edge=max(abs(local.x),abs(local.y));
  float antialias=u_cssSize.y/(u_resolution.y*u_size);
  float rim=1.-smoothstep(max(antialias,.006),max(antialias*2.,.017),.5-edge);
  float caustic=exp(-pow((.5-edge-.035)/.019,2.));
  float glint=(rim*(.08+.42*pow(max(facing,0.),3.))+
               caustic*.10*pow(max(-facing,0.),2.))*strength*u_light;
  color=mix(color,vec3(1.),clamp(glint,0.,.8));
  // Purple glass tint is confined to the tiles; the clear liquid stays unchanged.
  color=mix(color,vec3(94.,61.,239.)/255.,.15);
  float coverage=1.-smoothstep(.5-antialias,.5,edge);
  outColor=vec4(mix(original,clamp(color,0.,1.),coverage),.65);
}`;

const section = document.querySelector('.kantyna-live');
if (!section) return;
const menu = section.querySelector('.kantyna-menu');
if (menu && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  menu.classList.add('is-ready');
  const entrance = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    menu.classList.add('is-arriving');
    entrance.disconnect();
  }, { rootMargin: '0px 0px -24px 0px' });
  entrance.observe(menu);
}
// Original transparent Figma exports already contain the intended color and shading.
// Keep their native 16:9 proportions; only translate, uniformly scale and rotate.
if (!GLASS_ENABLED) {
  const layer = document.createElement('div');
  layer.className = 'kantyna-live__liquids';
  layer.setAttribute('aria-hidden', 'true');
  for (const name of ['03', '50', '01']) {
    const image = new Image(1920, 1080);
    image.alt = '';
    image.decoding = 'async';
    image.loading = 'lazy';
    image.src = new URL(`kantyna-liquid-${name}.png`, document.currentScript.src).href;
    layer.append(image);
  }
  section.prepend(layer);
  return;
}

const sourceUrl = new URL('liquid-packed.png', document.currentScript.src);
const fallback = document.createElement('canvas');
const canvas = document.createElement('canvas');
for (const layer of [fallback, canvas]) {
  layer.className = 'kantyna-live__art';
  layer.setAttribute('aria-hidden', 'true');
}
canvas.hidden = true;
section.prepend(fallback, canvas);
const context = fallback.getContext('2d');
const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false, powerPreference: 'low-power' });
const image = new Image();
let drawGlass, layout, frame, visible = false;

function hash(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7 + 17.2) * 43758.5453;
  return value - Math.floor(value);
}

function makeLayout(width, height) {
  const size = width < 768 ? 30 : 36;
  const cols = Math.ceil(width / size), rows = Math.ceil(height / size);
  const data = new Uint8Array(cols * rows);
  // Preserve the narrow composition around the menu instead of stretching it.
  const referenceWidth = Math.min(width, 945);
  const offset = (width - referenceWidth) / 2;
  const islands = [
    [.62, -.01, 200, 95],
    [.02, .10, 170, 160], [.98, .22, 195, 210],
    [-.02, .55, 200, 260], [1.02, .72, 190, 150],
    [.30, 1.04, 230, 160], [.88, .98, 260, 180]
  ].map(([x, y, rx, ry]) => [x * referenceWidth, y * height, rx, ry]);
  // New side bands add seeded islands at a fixed pitch and size. Adjacent
  // bands vary in density, position and radius without scaling the squares.
  const bands = Math.ceil(offset / 300);
  for (const side of [-1, 1]) {
    for (let band = 0; band < bands; band++) {
      for (let row = 0; row * 300 < height + 180; row++) {
        const seed = side * (band + 1);
        const x = (band + .5) * 300 + (hash(seed, row) - .5) * 100;
        islands.push([
          side < 0 ? -x : referenceWidth + x,
          row * 300 + (hash(seed + 19, row) - .5) * 160,
          160 + hash(seed + 41, row) * 70,
          160 + hash(seed + 73, row) * 100
        ]);
      }
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if ((row + col) % 2 === 0) continue;
      const x = (col + .5) * size - offset, y = (rows - row - .5) * size;
      let density = 0;
      for (const [cx, cy, rx, ry] of islands) {
        const distance = Math.hypot((x - cx) / rx, (y - cy) / ry);
        density = Math.max(density, .94 - distance * .64);
      }
      if (hash(col, row) < density) data[row * cols + col] = 255;
    }
  }
  return { width, height, size, cols, rows, data };
}

function createGlassRenderer() {
  const program = gl.createProgram();
  for (const [type, code] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, code);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const uniform = name => gl.getUniformLocation(program, name);
  function texture(unit, filter) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, key, filter);
    for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE);
  }
  texture(0, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.uniform1i(uniform('u_scene'), 0);
  texture(1, gl.NEAREST);
  gl.uniform1i(uniform('u_tiles'), 1);
  for (const [name, value] of Object.entries({ u_glass: GLASS_ENABLED ? 1 : 0, u_zoom: 1, u_blur: 0, u_strength: 1, u_aberration: 1, u_interaction: 0, u_light: .65 })) {
    gl.uniform1f(uniform(name), value);
  }
  gl.uniform2f(uniform('u_pointer'), .5, .5);
  return current => {
    const { width, height, size, cols, rows, data } = current;
    const ratio = Math.min(window.devicePixelRatio || 1, 2, 2400 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, cols, rows, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.uniform2f(uniform('u_resolution'), canvas.width, canvas.height);
    gl.uniform2f(uniform('u_cssSize'), width, height);
    gl.uniform2f(uniform('u_tileCount'), cols, rows);
    gl.uniform1f(uniform('u_size'), size);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Liquid background render failed.');
    canvas.hidden = false;
    fallback.hidden = true;
    canvas.dataset.renderer = 'webgl2';
  };
}

function draw() {
  const { width, height } = section.getBoundingClientRect();
  if (!width || !height) return;
  if (layout && layout.width === width && layout.height === height) return;
  layout = makeLayout(width, height);
  fallback.width = Math.ceil(width);
  fallback.height = Math.ceil(height);
  if (context && GLASS_ENABLED) {
    context.fillStyle = 'rgba(94, 61, 239, .14)';
    layout.data.forEach((value, index) => {
      if (value) context.fillRect(index % layout.cols * layout.size, (layout.rows - Math.floor(index / layout.cols) - 1) * layout.size, layout.size, layout.size);
    });
  }
  if (drawGlass && visible) {
    try { drawGlass(layout); }
    catch (error) { canvas.hidden = true; fallback.hidden = false; console.warn('Kantýna liquid:', error); }
  }
}

function schedule() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(draw);
}

if (gl) {
  image.onload = () => {
    try { drawGlass = createGlassRenderer(); layout = null; schedule(); }
    catch (error) { console.warn('Kantýna liquid:', error); }
  };
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); drawGlass = null; canvas.hidden = true; fallback.hidden = false;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    try { drawGlass = createGlassRenderer(); layout = null; schedule(); }
    catch (error) { console.warn('Kantýna liquid:', error); }
  });
}
new ResizeObserver(schedule).observe(section);
new IntersectionObserver(([entry]) => {
  visible = entry.isIntersecting;
  if (!visible) return;
  if (gl && !image.src) image.src = sourceUrl.href;
  layout = null;
  schedule();
}, { rootMargin: '200px' }).observe(section);
schedule();
})();

(function () {
    'use strict';

    const blocks = document.querySelectorAll('.intro-effect');
    if (!blocks.length) return;

    // Helper: detect small screens. Keep as fallback.
    const isSmallScreen = () => window.matchMedia && window.matchMedia('(max-width: 768px)').matches;

    // Helper: detect touch-only / touch-primary devices. We try media queries first which are more reliable
    // for distinguishing touch-only devices from hybrid laptops.
    function isTouchPrimary() {
        try {
            if (window.matchMedia) {
                // devices with coarse pointer and no hover are likely touch-first
                if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) return true;

                // if any-hover is not available, fallback below
            }

            if (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) {
                // If the device exposes touch points and doesn't report any hover capability, treat as touch-primary
                if (window.matchMedia && window.matchMedia('(any-hover: none)').matches) return true;

                // otherwise we can't be sure (could be hybrid), but still prefer touch-primary if there are multiple touch points
                if (navigator.maxTouchPoints > 1) return true;
            }

            if ('ontouchstart' in window && window.matchMedia && window.matchMedia('(any-hover: none)').matches) return true;
        } catch (e) {
            // ignore and fallback
        }
        return false;
    }

    // GLSL sources (unchanged)
    const VERT_SRC = `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;
        void main() {
            v_texCoord = a_texCoord;
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    `;

    const FRAG_SRC = `
        precision mediump float;
        
        uniform sampler2D u_video;
        varying vec2 v_texCoord;
        
        uniform vec3 u_color0;
        uniform vec3 u_color1;
        uniform vec3 u_color2;
        uniform float u_phase;
        uniform vec2 u_texScale;
        uniform vec2 u_texOffset;
        
        vec3 gradient(float t) {
            t = fract(t + u_phase);

            if (t < 0.3333) {
                float lt = t / 0.3333;
                return mix(u_color0, u_color1, lt);
            } 
            else if (t < 0.6666) {
                float lt = (t - 0.3333) / 0.3333;
                return mix(u_color1, u_color2, lt);
            }
            else {
                float lt = (t - 0.6666) / 0.3333;
                return mix(u_color2, u_color0, lt);
            }
        }
        
        void main() {
            vec2 uv = v_texCoord * u_texScale + u_texOffset;
            vec4 src = texture2D(u_video, uv);
            float lum = dot(src.rgb, vec3(0.2126, 0.7152, 0.0722));
            vec3 col = gradient(lum);
            gl_FragColor = vec4(col, src.a);
        }
    `;

    function createShader(gl, type, src) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, src);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    function createProgram(gl, vsSrc, fsSrc) {
        const vs = createShader(gl, gl.VERTEX_SHADER, vsSrc);
        const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSrc);
        if (!vs || !fs) return null;
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(prog));
            gl.deleteProgram(prog);
            return null;
        }
        return prog;
    }

    // For each block we create a small controller that can start/stop WebGL depending on the environment
    blocks.forEach(root => {
        // Read saved "apply effect" flag from markup (set in block.js save).
        // Default to `true` when attribute is missing (to preserve existing blocks saved before this change).
        const applyEffectAttr = root.getAttribute('data-apply-effect');
        const applyEffect = applyEffectAttr == null ? true : (applyEffectAttr === '1' || applyEffectAttr === 'true');

        // Detect iOS WebKit browsers (Safari, Chrome iOS, Firefox iOS, etc.).
        // All iOS browsers use WebKit under the hood and tend to share the same GL limits/crash behavior.
        function isIosWebKit() {
            try {
                const ua = navigator.userAgent || '';
                const isIOSUserAgent = /\b(iPad|iPhone|iPod)\b/.test(ua);
                // iPadOS 13+ reports as MacIntel; detect touch-capable Mac platform as iPadOS
                const isIPadOSPlatform = navigator.platform === 'MacIntel' && navigator.maxTouchPoints && navigator.maxTouchPoints > 1;
                const isIOS = isIOSUserAgent || isIPadOSPlatform;
                const isWebKit = /AppleWebKit/.test(ua);
                return isIOS && isWebKit;
            } catch (e) { return false; }
        }

        // On iOS WebKit we skip WebGL and use a CSS fallback, because GPU context stability is poor
        // across Safari/Chrome/Firefox wrappers on iPhone/iPad.
        const shouldForceSkipWebGL = isIosWebKit();

        const desktopVideo = root.querySelector('.ie-bg-video');
        const mobileVideo = root.querySelector('.ie-bg-video-mobile');

        // Check if video elements have actual src (are uploaded in admin)
        const hasDesktopVideo = desktopVideo && desktopVideo.src && desktopVideo.src.trim() !== '';
        const hasMobileVideo = mobileVideo && mobileVideo.src && mobileVideo.src.trim() !== '';

        // Get poster image (can be from video element, separate img, or CSS background)
        let posterUrl = null;

        if (desktopVideo?.poster && desktopVideo.poster.trim() !== '') {
            posterUrl = desktopVideo.poster;
        } else if (root.querySelector('.ie-bg-poster')?.src) {
            posterUrl = root.querySelector('.ie-bg-poster').src;
        } else {
            // Try to extract from CSS background-image
            try {
                const bgImage = window.getComputedStyle(root).backgroundImage;
                if (bgImage && bgImage !== 'none') {
                    const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
                    if (match && match[1]) {
                        posterUrl = match[1];
                    }
                }
            } catch (e) {
                // ignore
            }
        }

        // If no videos and no poster, skip this block entirely
        if (!hasDesktopVideo && !hasMobileVideo && !posterUrl) {
            console.warn('Intro effect block has no video or poster image');
            return;
        }

        // controller state
        let webgl = null; // will hold stop() if started

        // Decide if we should prefer the mobile video (skip WebGL). We only skip WebGL when a mobile video is present
        // and the device/viewport indicates touch-primary or small screen. We also allow global forcing to skip WebGL
        // on problematic platforms (e.g. iOS Safari) — in that case we will still honor `applyEffect` by using a CSS overlay.
        function preferMobileMode() {
            return hasMobileVideo && (isTouchPrimary() || isSmallScreen());
        }

        // Decide whether to use WebGL at all. If forced skip (iOS Safari) or the effect isn't applied, we won't start WebGL.
        function shouldUseWebGL() {
            if (!applyEffect) return false; // user disabled effect
            if (shouldForceSkipWebGL) return false; // platform doesn't play nicely with WebGL
            // otherwise prefer WebGL unless mobile mode selects the mobile video pipeline
            return true;
        }

        // Cleanup helper: hide/show video elements
        function showMobileVideo() {
            if (!hasMobileVideo) return;

            if (desktopVideo) {
                try { desktopVideo.pause(); } catch (e) {}
                desktopVideo.style.display = 'none';
            }
            // Position and size the mobile video exactly like the GL canvas would be
            mobileVideo.style.position = 'absolute';
            mobileVideo.style.top = '0';
            mobileVideo.style.left = '0';
            mobileVideo.style.width = '100%';
            mobileVideo.style.height = '100%';
            mobileVideo.style.objectFit = 'cover';
            // place it above the desktop video (canvas used +1); mirror same zIndex calc
            try {
                mobileVideo.style.zIndex = (desktopVideo && desktopVideo.style.zIndex) ? ((parseInt(desktopVideo.style.zIndex, 10) || 0) + 1).toString() : '1';
            } catch (e) { mobileVideo.style.zIndex = '1'; }
            // don't let the video steal pointer events (inner content should stay interactive)
            mobileVideo.style.pointerEvents = 'none';

            mobileVideo.style.display = 'block';
            mobileVideo.muted = true;
            mobileVideo.loop = true;
            mobileVideo.playsInline = true;
            // hint the browser to load earlier and try to start playback immediately
            try { mobileVideo.preload = 'auto'; } catch (e) {}
            tryPlayVideo(mobileVideo);
        }

        function hideMobileVideo() {
            if (mobileVideo) {
                try { mobileVideo.pause(); } catch (e) {}
                mobileVideo.style.display = 'none';
                // clear the inline styles we set so the editor/front-end markup remains clean
                try {
                    mobileVideo.style.position = '';
                    mobileVideo.style.top = '';
                    mobileVideo.style.left = '';
                    mobileVideo.style.width = '';
                    mobileVideo.style.height = '';
                    mobileVideo.style.objectFit = '';
                    mobileVideo.style.zIndex = '';
                    mobileVideo.style.pointerEvents = '';
                } catch (e) {}
             }
             if (desktopVideo) {
                 desktopVideo.style.display = '';
             }
         }

        // Try to start playback proactively (muted + playsInline should be set before calling)
        function tryPlayVideo(v) {
            if (!v || typeof v.play !== 'function') return;
            try { v.muted = true; } catch (e) {}
            try { v.playsInline = true; } catch (e) {}
            try { v.preload = 'auto'; } catch (e) {}

            const p = v.play && v.play();
            if (p && p.catch) {
                // If the immediate play() is rejected, retry once the video can play
                p.catch(() => {
                    const once = () => {
                        try { v.play(); } catch (e) {}
                        v.removeEventListener('canplay', once);
                    };
                    v.addEventListener('canplay', once);
                });
            }
        }

        // Start WebGL pipeline and return a stop() function
        function startWebGL() {
            // Need at least a poster to render
            if (!posterUrl) return null;

            // avoid double-start
            if (webgl) return webgl;

            // If desktop video exists and has src, encourage it to start as soon as possible (helps Safari)
            if (hasDesktopVideo && desktopVideo) {
                try { desktopVideo.muted = true; } catch (e) {}
                try { desktopVideo.playsInline = true; } catch (e) {}
                try { desktopVideo.preload = 'auto'; } catch (e) {}
                tryPlayVideo(desktopVideo);
            }

            // create canvas and wire up GL (based on original code)
            const canvas = document.createElement('canvas');
            canvas.style.position = 'absolute';
            canvas.style.top      = '0';
            canvas.style.left     = '0';
            canvas.style.width    = '100%';
            canvas.style.height   = '100%';
            canvas.style.objectFit = 'cover';
            canvas.style.pointerEvents = 'none';

            // Set zIndex based on desktopVideo if it exists
            if (desktopVideo) {
                canvas.style.zIndex = (desktopVideo.style.zIndex ? parseInt(desktopVideo.style.zIndex, 10) : 0) + 1;

                try {
                    var videoFilter = window.getComputedStyle(desktopVideo).filter;
                    if (videoFilter && videoFilter !== 'none') {
                        var m = videoFilter.match(/blur\([^)]*\)/);
                        if (m) {
                            canvas.style.filter = m[0];
                        }
                    }
                } catch (e) {}

                desktopVideo.parentNode.insertBefore(canvas, desktopVideo.nextSibling);
            } else {
                // No video element, append canvas directly to root
                canvas.style.zIndex = '1';
                root.style.position = root.style.position || 'relative';
                root.insertBefore(canvas, root.firstChild);
            }

            const gl = canvas.getContext('webgl', {
                alpha: true,
                premultipliedAlpha: true,
                preserveDrawingBuffer: false,
                powerPreference: 'default'
            }) || canvas.getContext('experimental-webgl', {
                alpha: true,
                premultipliedAlpha: true,
                preserveDrawingBuffer: false,
                powerPreference: 'default'
            });

            if (!gl) {
                console.warn('WebGL is not supported');
                // remove canvas
                canvas.parentNode && canvas.parentNode.removeChild(canvas);
                return null;
            }

            const program = createProgram(gl, VERT_SRC, FRAG_SRC);
            if (!program) {
                canvas.parentNode && canvas.parentNode.removeChild(canvas);
                return null;
            }

            gl.useProgram(program);

            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
            gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

            const quadBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);

            const quadData = new Float32Array([
                -1, -1,  0, 1,
                1, -1,  1, 1,
                -1,  1,  0, 0,
                -1,  1,  0, 0,
                1, -1,  1, 1,
                1,  1,  1, 0
            ]);

            gl.bufferData(gl.ARRAY_BUFFER, quadData, gl.STATIC_DRAW);

            const a_position = gl.getAttribLocation(program, 'a_position');
            const a_texCoord = gl.getAttribLocation(program, 'a_texCoord');

            gl.enableVertexAttribArray(a_position);
            gl.enableVertexAttribArray(a_texCoord);

            gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 16, 0);
            gl.vertexAttribPointer(a_texCoord, 2, gl.FLOAT, false, 16, 8);

            const videoTex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, videoTex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

            const posterTex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, posterTex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

            const glMaxTextureSize = (() => {
                try {
                    const value = gl.getParameter(gl.MAX_TEXTURE_SIZE);
                    return (typeof value === 'number' && value > 0) ? value : 4096;
                } catch (e) {
                    return 4096;
                }
            })();
            const maxRenderPixels = 1920 * 1080 * 1.5;

            let posterLoaded = false;
            let showVideo = false;
            let rafId = null;
            let loopStarted = false;

            // Load poster image if available
            if (posterUrl) {
                const posterImg = new Image();

                // Only set crossOrigin if loading from different domain
                try {
                    const url = new URL(posterUrl, window.location.href);
                    if (url.origin !== window.location.origin) {
                        posterImg.crossOrigin = "anonymous";
                    }
                } catch (e) {
                    // If URL parsing fails, don't set crossOrigin (likely relative URL)
                }

                posterImg.onload = () => {
                    try {
                        gl.bindTexture(gl.TEXTURE_2D, posterTex);
                        gl.texImage2D(
                            gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,
                            gl.UNSIGNED_BYTE, posterImg
                        );
                        posterLoaded = true;
                        // Start the loop once poster is loaded
                        if (!loopStarted) {
                            loopStarted = true;
                            loop();
                        }
                    } catch (err) {
                        console.warn('Failed to load poster texture:', err);
                    }
                };

                posterImg.onerror = (err) => {
                    console.warn('Failed to load poster image:', posterUrl, err);
                    // Try to start loop anyway with video if available
                    if (hasDesktopVideo && !loopStarted) {
                        loopStarted = true;
                        loop();
                    }
                };

                posterImg.src = posterUrl;
            } else if (hasDesktopVideo) {
                // No poster but has video, start loop immediately
                loopStarted = true;
                loop();
            }

            gl.uniform1i(gl.getUniformLocation(program, 'u_video'), 0);

            const u_color0 = gl.getUniformLocation(program, 'u_color0');
            const u_color1 = gl.getUniformLocation(program, 'u_color1');
            const u_color2 = gl.getUniformLocation(program, 'u_color2');

            const norm = (r, g, b) => [r/255, g/255, b/255];

            gl.uniform3fv(u_color0, norm(231, 34, 114));
            gl.uniform3fv(u_color1, norm(78, 39, 151));
            gl.uniform3fv(u_color2, norm(13, 15, 62));

            const u_phase = gl.getUniformLocation(program, 'u_phase');
            const u_texScale = gl.getUniformLocation(program, 'u_texScale');
            const u_texOffset = gl.getUniformLocation(program, 'u_texOffset');
            let phase = 0.0;
            let texScale = [1, 1];
            let texOffset = [0, 0];

            let lastX = 0, lastY = 0, initialized = false;
            const speed = 0.0006;
            let vel = 0;
            const smooth = 0.15;

            function mouseMoveHandler(e) {
                if (!initialized) {
                    lastX = e.clientX;
                    lastY = e.clientY;
                    initialized = true;
                    return;
                }

                const dx = e.clientX - lastX;
                const dy = e.clientY - lastY;

                lastX = e.clientX;
                lastY = e.clientY;

                const delta = (dx + dy) * speed;
                vel = vel * (1 - smooth) + delta * smooth;

                phase += vel;
                phase -= Math.floor(phase);
            }

            root.addEventListener('mousemove', mouseMoveHandler);

            function resizeHandler() {
                // Use rendered element dimensions, not source video dimensions, to avoid huge allocations.
                const cssW = Math.max(
                    1,
                    Math.round(
                        root.clientWidth ||
                        (desktopVideo && desktopVideo.clientWidth) ||
                        window.innerWidth ||
                        1
                    )
                );
                const cssH = Math.max(
                    1,
                    Math.round(
                        root.clientHeight ||
                        (desktopVideo && desktopVideo.clientHeight) ||
                        window.innerHeight ||
                        1
                    )
                );

                // Hard cap DPR for GPU stability on mobile and low-memory environments.
                const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
                let targetW = Math.max(1, Math.round(cssW * dpr));
                let targetH = Math.max(1, Math.round(cssH * dpr));

                // Respect device GL limits (max texture size and max total pixel count).
                let scale = 1;
                if (targetW > glMaxTextureSize || targetH > glMaxTextureSize) {
                    scale = Math.min(scale, glMaxTextureSize / targetW, glMaxTextureSize / targetH);
                }
                const pixelCount = targetW * targetH;
                if (pixelCount > maxRenderPixels) {
                    scale = Math.min(scale, Math.sqrt(maxRenderPixels / pixelCount));
                }
                if (scale < 1) {
                    targetW = Math.max(1, Math.floor(targetW * scale));
                    targetH = Math.max(1, Math.floor(targetH * scale));
                }

                canvas.width  = targetW;
                canvas.height = targetH;
                gl.viewport(0, 0, canvas.width, canvas.height);
            }

            function render() {
                try {
                    gl.clear(gl.COLOR_BUFFER_BIT);
                    gl.activeTexture(gl.TEXTURE0);

                    // Try to use video if available and ready, otherwise use poster
                    if (hasDesktopVideo && showVideo && desktopVideo && desktopVideo.readyState >= 2) {
                        gl.bindTexture(gl.TEXTURE_2D, videoTex);
                        gl.texImage2D(
                            gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,
                            gl.UNSIGNED_BYTE, desktopVideo
                        );
                    } else if (posterLoaded) {
                        gl.bindTexture(gl.TEXTURE_2D, posterTex);
                    } else {
                        // Nothing to render yet
                        return;
                    }

                    gl.uniform1f(u_phase, phase);
                    gl.uniform2fv(u_texScale, texScale);
                    gl.uniform2fv(u_texOffset, texOffset);
                    gl.drawArrays(gl.TRIANGLES, 0, 6);
                } catch (err) {
                    console.warn('WebGL render error:', err);
                    // Stop the loop on repeated errors to prevent crash
                    if (rafId) {
                        cancelAnimationFrame(rafId);
                        rafId = null;
                        loopStarted = false;
                    }
                }
            }

            function loop() {
                if (!gl || gl.isContextLost()) {
                    console.warn('WebGL context is lost, stopping loop');
                    if (rafId) {
                        cancelAnimationFrame(rafId);
                        rafId = null;
                        loopStarted = false;
                    }
                    return;
                }
                render();
                rafId = requestAnimationFrame(loop);
            }

            function onVideoLoadedMetadata() {
                resizeHandler();
            }

            function onVideoPlay() {
                showVideo = true;
                resizeHandler();
            }

            // Only attach video event listeners if video exists
            if (hasDesktopVideo && desktopVideo) {
                desktopVideo.addEventListener('loadedmetadata', onVideoLoadedMetadata);
                desktopVideo.addEventListener('play', onVideoPlay);
            }

            window.addEventListener('resize', resizeHandler);

            // Handle WebGL context loss (common in mobile Safari)
            canvas.addEventListener('webglcontextlost', (e) => {
                e.preventDefault();
                console.warn('WebGL context lost');
                if (rafId) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                    loopStarted = false;
                }
            });

            canvas.addEventListener('webglcontextrestored', () => {
                console.log('WebGL context restored');
                resizeHandler();
                if (!loopStarted && posterLoaded) {
                    loopStarted = true;
                    loop();
                }
            });

            // Initial resize and render
            resizeHandler();
            if (posterLoaded) {
                render();
            }

            // Return stop function to teardown
            const stop = () => {
                if (rafId) cancelAnimationFrame(rafId);
                if (hasDesktopVideo && desktopVideo) {
                    try { desktopVideo.removeEventListener('loadedmetadata', onVideoLoadedMetadata); } catch (e) {}
                    try { desktopVideo.removeEventListener('play', onVideoPlay); } catch (e) {}
                    // Best-effort: pause desktop video so it doesn't keep decoding
                    try { desktopVideo.pause(); } catch (e) {}
                }
                try { window.removeEventListener('resize', resizeHandler); } catch (e) {}
                try { root.removeEventListener('mousemove', mouseMoveHandler); } catch (e) {}
                try {
                    const loseCtx = gl.getExtension('WEBGL_lose_context');
                    if (loseCtx && typeof loseCtx.loseContext === 'function') {
                        loseCtx.loseContext();
                    }
                } catch (e) {}
                // Remove canvas
                canvas.parentNode && canvas.parentNode.removeChild(canvas);
            };

            webgl = { stop };
            return webgl;
        }

        function stopWebGL() {
            if (webgl && typeof webgl.stop === 'function') {
                webgl.stop();
                webgl = null;
            }
        }

        // Apply current preferred mode (mobile vs webgl)
        function applyMode() {
            const useMobile = preferMobileMode();

            if (useMobile) {
                // switch to mobile video mode
                stopWebGL();
                showMobileVideo();
                removeCssGradientOverlay();
            } else {
                // if the platform or user prefers to skip WebGL, apply CSS fallback (if effect enabled)
                hideMobileVideo();
                if (shouldUseWebGL()) {
                    removeCssGradientOverlay();
                    if (!webgl) startWebGL();
                } else {
                    // Don't start WebGL; if effect requested, layer a lightweight CSS gradient overlay
                    stopWebGL();
                    if (applyEffect) applyCssGradientOverlay();
                }
            }
        }

        // Apply/remove a simple CSS gradient overlay on top of the block to mimic the WebGL gradient effect
        let _overlayEl = null;
        function applyCssGradientOverlay() {
            if (_overlayEl) return;
            _overlayEl = document.createElement('div');
            _overlayEl.className = 'ie-gradient-overlay';
            // keep pointer events off, fill the block
            _overlayEl.style.position = 'absolute';
            _overlayEl.style.inset = '0';
            _overlayEl.style.pointerEvents = 'none';
            _overlayEl.style.zIndex = (desktopVideo && desktopVideo.style.zIndex) ? ((parseInt(desktopVideo.style.zIndex, 10) || 0) + 2).toString() : '2';
            // use a CSS animation to slightly shift the gradient as a low-cost alternative
            _overlayEl.style.background = 'linear-gradient(90deg, rgba(231,34,114,0.45), rgba(78,39,151,0.35), rgba(13,15,62,0.45))';
            _overlayEl.style.mixBlendMode = 'screen';
            _overlayEl.style.transition = 'opacity 300ms ease';
            _overlayEl.style.opacity = '1';

            // append overlay inside root and ensure root is positioned
            root.style.position = root.style.position || 'relative';
            root.insertBefore(_overlayEl, root.firstChild);

            // Mousemove-driven subtle shift using transforms (mimics phase shifts but lightweight)
            let lastX = 0, lastY = 0, inited = false, tx = 0;
            function mm(e) {
                if (!inited) { lastX = e.clientX; lastY = e.clientY; inited = true; return; }
                const dx = (e.clientX - lastX) * 0.02;
                lastX = e.clientX; lastY = e.clientY;
                tx = tx * 0.8 + dx * 0.2;
                // small translate to create a moving gradient
                _overlayEl.style.transform = 'translateX(' + (tx*10) + 'px)';
            }
            root.addEventListener('mousemove', mm);
            _overlayEl._mm = mm; // store handler for removal
        }

        function removeCssGradientOverlay() {
            if (!_overlayEl) return;
            try {
                root.removeEventListener('mousemove', _overlayEl._mm);
            } catch (e) {}
            try { _overlayEl.parentNode && _overlayEl.parentNode.removeChild(_overlayEl); } catch (e) {}
            _overlayEl = null;
        }

         // Debounced resize handler to re-evaluate mode when viewport or capabilities change
         let resizeTimeout = null;
         function onViewportChange() {
             if (resizeTimeout) clearTimeout(resizeTimeout);
             resizeTimeout = setTimeout(() => {
                 applyMode();
             }, 150);
         }

         // Listen to relevant global changes
         window.addEventListener('resize', onViewportChange);
         window.addEventListener('orientationchange', onViewportChange);

         // Also listen to media-query changes for pointer/hover if supported
         try {
             if (window.matchMedia) {
                 const mq = window.matchMedia('(hover: none) and (pointer: coarse)');
                 if (mq && typeof mq.addEventListener === 'function') {
                     mq.addEventListener('change', onViewportChange);
                 } else if (mq && typeof mq.addListener === 'function') {
                     mq.addListener(onViewportChange);
                 }
             }
         } catch (e) {}

         // Initial application
         applyMode();
     });


    //camera-trigger functionality
    //if user has ?camera=1 in URL, set camera-trigger to display: block !important
    const trigger = document.getElementById('camera-trigger');
    if (trigger) {
        const hasFeatureFlag = new URLSearchParams(window.location.search).get('camera') === '1';
        console.log('hasFeatureFlag: ', hasFeatureFlag);
        if(hasFeatureFlag) {
            trigger.style.display = 'block';
        }

        trigger.addEventListener('click', async () => {
            // 1. ask permission to access camera and start front camera
            let cameraStream = null;
            try {
                cameraStream = await navigator.mediaDevices.getUserMedia({
                    video: {facingMode: 'user'},
                    audio: false
                });

                // 3. Disable scroll on body
                const originalOverflow = document.body.style.overflow;
                const originalPosition = document.body.style.position;
                document.body.style.overflow = 'hidden';
                document.body.style.position = 'fixed';
                document.body.style.width = '100%';
                document.body.style.height = '100%';

                // Create fullscreen overlay
                const overlay = document.createElement('div');
                overlay.style.position = 'fixed';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.width = '100vw';
                overlay.style.height = '100vh';
                overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
                overlay.style.zIndex = '999999';
                overlay.style.cursor = 'pointer';
                overlay.style.display = 'flex';
                overlay.style.alignItems = 'center';
                overlay.style.justifyContent = 'center';
                overlay.classList.add('camera-overlay');
                document.body.appendChild(overlay);

                // 4. Create video element for camera stream
                const cameraVideo = document.createElement('video');
                cameraVideo.style.width = '100%';
                cameraVideo.style.height = '100%';
                cameraVideo.style.objectFit = 'cover';
                cameraVideo.style.transform = 'scaleX(-1)';
                cameraVideo.autoplay = true;
                cameraVideo.playsInline = true;
                cameraVideo.muted = true;
                cameraVideo.srcObject = cameraStream;
                overlay.appendChild(cameraVideo);

                // 5. Apply WebGL effect to camera stream
                const cameraCanvas = document.createElement('canvas');
                cameraCanvas.style.position = 'absolute';
                cameraCanvas.style.top = '0';
                cameraCanvas.style.left = '0';
                cameraCanvas.style.width = '100%';
                cameraCanvas.style.height = '100%';
                cameraCanvas.style.objectFit = 'cover';
                cameraCanvas.style.transform = 'scaleX(-1)';
                cameraCanvas.style.pointerEvents = 'none';
                overlay.appendChild(cameraCanvas);

                const h2 = document.createElement('h2');
                h2.classList.add('wp-block-heading');
                h2.style.position = 'absolute';
                h2.style.bottom = '60px';
                h2.style.left = '30px';
                h2.style.zIndex = '1000';
                h2.style.fontSize = '3.5vw';
                h2.innerHTML = 'Zlin<br>' +
                    '<span style="font-weight: 900;">Design</span><br>' +
                    'Week<br>2026<br><br>' +
                    '<div class="wp-block-button"><a class="wp-block-button__link wp-element-button">←</a></div>';
                overlay.appendChild(h2);

                const cameraGl = cameraCanvas.getContext('webgl', {
                    alpha: true,
                    premultipliedAlpha: true,
                    preserveDrawingBuffer: false,
                    powerPreference: 'default'
                }) || cameraCanvas.getContext('experimental-webgl', {
                    alpha: true,
                    premultipliedAlpha: true,
                    preserveDrawingBuffer: false,
                    powerPreference: 'default'
                });

                let cameraRafId = null;

                if (cameraGl) {
                    const cameraProgram = createProgram(cameraGl, VERT_SRC, FRAG_SRC);
                    if (cameraProgram) {
                        cameraGl.useProgram(cameraProgram);
                        cameraGl.pixelStorei(cameraGl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
                        cameraGl.pixelStorei(cameraGl.UNPACK_COLORSPACE_CONVERSION_WEBGL, cameraGl.NONE);

                        const cameraQuadBuffer = cameraGl.createBuffer();
                        cameraGl.bindBuffer(cameraGl.ARRAY_BUFFER, cameraQuadBuffer);
                        const cameraQuadData = new Float32Array([
                            -1, -1, 0, 1,
                            1, -1, 1, 1,
                            -1, 1, 0, 0,
                            -1, 1, 0, 0,
                            1, -1, 1, 1,
                            1, 1, 1, 0
                        ]);
                        cameraGl.bufferData(cameraGl.ARRAY_BUFFER, cameraQuadData, cameraGl.STATIC_DRAW);

                        const camera_a_position = cameraGl.getAttribLocation(cameraProgram, 'a_position');
                        const camera_a_texCoord = cameraGl.getAttribLocation(cameraProgram, 'a_texCoord');
                        cameraGl.enableVertexAttribArray(camera_a_position);
                        cameraGl.enableVertexAttribArray(camera_a_texCoord);
                        cameraGl.vertexAttribPointer(camera_a_position, 2, cameraGl.FLOAT, false, 16, 0);
                        cameraGl.vertexAttribPointer(camera_a_texCoord, 2, cameraGl.FLOAT, false, 16, 8);

                        const cameraVideoTex = cameraGl.createTexture();
                        cameraGl.bindTexture(cameraGl.TEXTURE_2D, cameraVideoTex);
                        cameraGl.texParameteri(cameraGl.TEXTURE_2D, cameraGl.TEXTURE_WRAP_S, cameraGl.CLAMP_TO_EDGE);
                        cameraGl.texParameteri(cameraGl.TEXTURE_2D, cameraGl.TEXTURE_WRAP_T, cameraGl.CLAMP_TO_EDGE);
                        cameraGl.texParameteri(cameraGl.TEXTURE_2D, cameraGl.TEXTURE_MIN_FILTER, cameraGl.LINEAR);
                        cameraGl.texParameteri(cameraGl.TEXTURE_2D, cameraGl.TEXTURE_MAG_FILTER, cameraGl.LINEAR);

                        cameraGl.uniform1i(cameraGl.getUniformLocation(cameraProgram, 'u_video'), 0);

                        const camera_u_color0 = cameraGl.getUniformLocation(cameraProgram, 'u_color0');
                        const camera_u_color1 = cameraGl.getUniformLocation(cameraProgram, 'u_color1');
                        const camera_u_color2 = cameraGl.getUniformLocation(cameraProgram, 'u_color2');
                        const norm = (r, g, b) => [r / 255, g / 255, b / 255];
                        cameraGl.uniform3fv(camera_u_color0, norm(231, 34, 114));
                        cameraGl.uniform3fv(camera_u_color1, norm(78, 39, 151));
                        cameraGl.uniform3fv(camera_u_color2, norm(13, 15, 62));

                        const camera_u_phase = cameraGl.getUniformLocation(cameraProgram, 'u_phase');
                        const camera_u_texScale = cameraGl.getUniformLocation(cameraProgram, 'u_texScale');
                        const camera_u_texOffset = cameraGl.getUniformLocation(cameraProgram, 'u_texOffset');
                        let cameraPhase = 0.0;
                        let cameraTexScale = [1, 1];
                        let cameraTexOffset = [0, 0];

                        let cameraLastX = 0, cameraLastY = 0, cameraInitialized = false;
                        const cameraSpeed = 0.0006;
                        let cameraVel = 0;
                        const cameraSmooth = 0.15;

                        function cameraMouseMoveHandler(e) {
                            if (!cameraInitialized) {
                                cameraLastX = e.clientX;
                                cameraLastY = e.clientY;
                                cameraInitialized = true;
                                return;
                            }
                            const dx = e.clientX - cameraLastX;
                            const dy = e.clientY - cameraLastY;
                            cameraLastX = e.clientX;
                            cameraLastY = e.clientY;
                            const delta = (dx + dy) * cameraSpeed;
                            cameraVel = cameraVel * (1 - cameraSmooth) + delta * cameraSmooth;
                            cameraPhase += cameraVel;
                            cameraPhase -= Math.floor(cameraPhase);
                        }

                        overlay.addEventListener('mousemove', cameraMouseMoveHandler);

                        function cameraResizeHandler() {
                            const dpr = window.devicePixelRatio || 1;
                            cameraCanvas.width = window.innerWidth * dpr;
                            cameraCanvas.height = window.innerHeight * dpr;
                            cameraGl.viewport(0, 0, cameraCanvas.width, cameraCanvas.height);

                            if (cameraVideo.videoWidth > 0 && cameraVideo.videoHeight > 0) {
                                const canvasAspect = cameraCanvas.width / cameraCanvas.height;
                                const videoAspect = cameraVideo.videoWidth / cameraVideo.videoHeight;

                                if (canvasAspect > videoAspect) {
                                    cameraTexScale = [1, videoAspect / canvasAspect];
                                    cameraTexOffset = [0, (1 - cameraTexScale[1]) / 2];
                                } else {
                                    cameraTexScale = [canvasAspect / videoAspect, 1];
                                    cameraTexOffset = [(1 - cameraTexScale[0]) / 2, 0];
                                }
                            }
                        }

                        function cameraRender() {
                            try {
                                if (cameraVideo.readyState >= 2) {
                                    cameraGl.clear(cameraGl.COLOR_BUFFER_BIT);
                                    cameraGl.activeTexture(cameraGl.TEXTURE0);
                                    cameraGl.bindTexture(cameraGl.TEXTURE_2D, cameraVideoTex);
                                    cameraGl.texImage2D(
                                        cameraGl.TEXTURE_2D, 0, cameraGl.RGBA, cameraGl.RGBA,
                                        cameraGl.UNSIGNED_BYTE, cameraVideo
                                    );

                                    // Update aspect ratio if needed (video might have loaded late)
                                    if (cameraTexScale[0] === 1 && cameraTexScale[1] === 1 && cameraVideo.videoWidth > 0) {
                                        cameraResizeHandler();
                                    }

                                    cameraGl.uniform1f(camera_u_phase, cameraPhase);
                                    cameraGl.uniform2fv(camera_u_texScale, cameraTexScale);
                                    cameraGl.uniform2fv(camera_u_texOffset, cameraTexOffset);
                                    cameraGl.drawArrays(cameraGl.TRIANGLES, 0, 6);
                                }
                            } catch (err) {
                                console.warn('Camera WebGL render error:', err);
                            }
                        }

                        function cameraLoop() {
                            if (!cameraGl || cameraGl.isContextLost()) {
                                if (cameraRafId) {
                                    cancelAnimationFrame(cameraRafId);
                                    cameraRafId = null;
                                }
                                return;
                            }
                            cameraRender();
                            cameraRafId = requestAnimationFrame(cameraLoop);
                        }

                        cameraResizeHandler();
                        cameraLoop();

                        window.addEventListener('resize', cameraResizeHandler);
                        overlay._cameraResizeHandler = cameraResizeHandler;
                        overlay._cameraMouseMoveHandler = cameraMouseMoveHandler;
                    }
                }

                // 6. Click anywhere to close overlay and cleanup
                overlay.addEventListener('click', () => {
                    // Stop camera stream
                    if (cameraStream) {
                        const tracks = cameraStream.getTracks();
                        tracks.forEach(track => track.stop());
                    }

                    // Stop WebGL rendering
                    if (cameraRafId) {
                        cancelAnimationFrame(cameraRafId);
                        cameraRafId = null;
                    }

                    // Remove event listeners
                    if (overlay._cameraResizeHandler) {
                        window.removeEventListener('resize', overlay._cameraResizeHandler);
                    }

                    // Remove overlay
                    overlay.parentNode && overlay.parentNode.removeChild(overlay);

                    // Restore body scroll
                    document.body.style.overflow = originalOverflow;
                    document.body.style.position = originalPosition;
                    document.body.style.width = '';
                    document.body.style.height = '';
                });

            } catch (err) {
                // 2. if denied, do nothing
                console.warn('Camera access denied or not available:', err);
                return;
            }
        });
    }

})();

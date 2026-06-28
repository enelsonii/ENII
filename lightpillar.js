// lightpillar.js

// 1. Import Three.js from a CDN
import * as THREE from 'https://esm.sh/three';

/**
 * Initializes the LightPillar effect in a given container.
 * @param {HTMLElement} container - The DOM element to host the canvas.
 * @param {Object} options - Configuration options.
 */
export function initLightPillar(container, options = {}) {
  // Default Props
  const settings = {
    topColor: '#5227FF',
    bottomColor: '#FF9FFC',
    intensity: 1.0,
    rotationSpeed: 0.3,
    interactive: false,
    glowAmount: 0.005,
    pillarWidth: 3.0,
    pillarHeight: 0.4,
    noiseIntensity: 0.5,
    pillarRotation: 0,
    quality: 'high', // 'low', 'medium', 'high'
    ...options
  };

  // 2. Quality & Performance Settings
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isLowEndDevice = isMobile || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

  let effectiveQuality = settings.quality;
  if (isLowEndDevice && settings.quality === 'high') effectiveQuality = 'medium';
  if (isMobile && settings.quality !== 'low') effectiveQuality = 'low';

  const qualitySettings = {
    low: { iterations: 24, waveIterations: 1, pixelRatio: 0.5, precision: 'mediump', stepMultiplier: 1.5 },
    medium: { iterations: 40, waveIterations: 2, pixelRatio: 0.65, precision: 'mediump', stepMultiplier: 1.2 },
    high: {
      iterations: 80,
      waveIterations: 4,
      pixelRatio: Math.min(window.devicePixelRatio, 2),
      precision: 'highp',
      stepMultiplier: 1.0
    }
  };

  const q = qualitySettings[effectiveQuality] || qualitySettings.medium;

  // 3. Setup Scene, Camera, Renderer
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: true,
    precision: q.precision,
    stencil: false,
    depth: false
  });

  renderer.setPixelRatio(q.pixelRatio);
  Object.assign(renderer.domElement.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    display: 'block'
  });
  container.appendChild(renderer.domElement);

  // 4. Shaders
  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    precision ${q.precision} float;

    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec2 uMouse;
    uniform vec3 uTopColor;
    uniform vec3 uBottomColor;
    uniform float uIntensity;
    uniform bool uInteractive;
    uniform float uGlowAmount;
    uniform float uPillarWidth;
    uniform float uPillarHeight;
    uniform float uNoiseIntensity;
    uniform float uRotCos;
    uniform float uRotSin;
    uniform float uPillarRotCos;
    uniform float uPillarRotSin;
    uniform float uWaveSin;
    uniform float uWaveCos;
    varying vec2 vUv;

    const float STEP_MULT = ${q.stepMultiplier.toFixed(1)};
    const int MAX_ITER = ${q.iterations};
    const int WAVE_ITER = ${q.waveIterations};

    void main() {
      vec2 uv = (vUv * 2.0 - 1.0) * vec2(uResolution.x / uResolution.y, 1.0);
      uv = vec2(uPillarRotCos * uv.x - uPillarRotSin * uv.y, uPillarRotSin * uv.x + uPillarRotCos * uv.y);

      vec3 ro = vec3(0.0, 0.0, -10.0);
      vec3 rd = normalize(vec3(uv, 1.0));

      float rotC = uRotCos;
      float rotS = uRotSin;
      if(uInteractive && (uMouse.x != 0.0 || uMouse.y != 0.0)) {
        float a = uMouse.x * 6.283185;
        rotC = cos(a);
        rotS = sin(a);
      }

      vec3 col = vec3(0.0);
      float t = 0.1;
      
      for(int i = 0; i < MAX_ITER; i++) {
        vec3 p = ro + rd * t;
        p.xz = vec2(rotC * p.x - rotS * p.z, rotS * p.x + rotC * p.z);

        vec3 q = p;
        q.y = p.y * uPillarHeight + uTime;
        
        float freq = 1.0;
        float amp = 1.0;
        for(int j = 0; j < WAVE_ITER; j++) {
          q.xz = vec2(uWaveCos * q.x - uWaveSin * q.z, uWaveSin * q.x + uWaveCos * q.z);
          q += cos(q.zxy * freq - uTime * float(j) * 2.0) * amp;
          freq *= 2.0;
          amp *= 0.5;
        }
        
        float d = length(cos(q.xz)) - 0.2;
        float bound = length(p.xz) - uPillarWidth;
        float k = 4.0;
        float h = max(k - abs(d - bound), 0.0);
        d = max(d, bound) + h * h * 0.0625 / k;
        d = abs(d) * 0.15 + 0.01;

        float grad = clamp((15.0 - p.y) / 30.0, 0.0, 1.0);
        col += mix(uBottomColor, uTopColor, grad) / d;

        t += d * STEP_MULT;
        if(t > 50.0) break;
      }

      float widthNorm = uPillarWidth / 3.0;
      col = tanh(col * uGlowAmount / widthNorm);
      
      col -= fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) / 15.0 * uNoiseIntensity;
      
      gl_FragColor = vec4(col * uIntensity, 1.0);
    }
  `;

  const parseColor = hex => {
    const color = new THREE.Color(hex);
    return new THREE.Vector3(color.r, color.g, color.b);
  };

  const pillarRotRad = (settings.pillarRotation * Math.PI) / 180;
  const waveSin = Math.sin(0.4);
  const waveCos = Math.cos(0.4);

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(container.clientWidth, container.clientHeight) },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uTopColor: { value: parseColor(settings.topColor) },
      uBottomColor: { value: parseColor(settings.bottomColor) },
      uIntensity: { value: settings.intensity },
      uInteractive: { value: settings.interactive },
      uGlowAmount: { value: settings.glowAmount },
      uPillarWidth: { value: settings.pillarWidth },
      uPillarHeight: { value: settings.pillarHeight },
      uNoiseIntensity: { value: settings.noiseIntensity },
      uRotCos: { value: 1.0 },
      uRotSin: { value: 0.0 },
      uPillarRotCos: { value: Math.cos(pillarRotRad) },
      uPillarRotSin: { value: Math.sin(pillarRotRad) },
      uWaveSin: { value: waveSin },
      uWaveCos: { value: waveCos }
    },
    transparent: true,
    depthWrite: false,
    depthTest: false
  });

  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // 5. Handle Resize
  const handleResize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height);
    material.uniforms.uResolution.value.set(width, height);
  };
  window.addEventListener('resize', handleResize, { passive: true });
  handleResize();

  // 6. Handle Interaction
  const mouse = new THREE.Vector2(0, 0);
  const handleMouseMove = (e) => {
    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  };
  if (settings.interactive) {
    container.addEventListener('mousemove', handleMouseMove, { passive: true });
  }

  // 7. Animation Loop
  let time = 0;
  let rotationSpeed = settings.rotationSpeed;
  let rafId;

  const animate = (now) => {
    time += 0.016 * rotationSpeed;
    material.uniforms.uTime.value = time;
    material.uniforms.uRotCos.value = Math.cos(time * 0.3);
    material.uniforms.uRotSin.value = Math.sin(time * 0.3);
    
    if (settings.interactive) {
      material.uniforms.uMouse.value.copy(mouse);
    }

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(animate);
  };

  rafId = requestAnimationFrame(animate);

  // 8. Return cleanup function
  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', handleResize);
    container.removeEventListener('mousemove', handleMouseMove);
    renderer.dispose();
    geometry.dispose();
    material.dispose();
    if (container.contains(renderer.domElement)) {
      container.removeChild(renderer.domElement);
    }
  };
}

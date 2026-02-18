import { useEffect, useRef } from "react";
import { Renderer, Camera, Geometry, Program, Mesh } from "ogl";

const vertex = /* glsl */ `
  attribute vec3 position;
  attribute vec4 random;
  attribute vec3 color;

  uniform mat4 modelMatrix;
  uniform mat4 viewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uTime;
  uniform float uSpread;
  uniform float uBaseSize;
  uniform float uSizeRandomness;

  varying vec4 vRandom;
  varying vec3 vColor;

  void main() {
    vRandom = random;
    vColor = color;

    vec3 pos = position * uSpread;
    pos.x += sin(uTime * 0.2 + random.x * 6.28318) * random.y * 0.5;
    pos.y += sin(uTime * 0.3 + random.z * 6.28318) * random.w * 0.5;

    vec4 mvPosition = viewMatrix * modelMatrix * vec4(pos, 1.0);
    gl_PointSize = (uBaseSize * (1.0 + uSizeRandomness * (random.x - 0.5))) / -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragment = /* glsl */ `
  precision highp float;

  uniform float uAlphaParticles;

  varying vec4 vRandom;
  varying vec3 vColor;

  void main() {
    vec2 uv = gl_PointCoord.xy;
    float circle = smoothstep(0.5, 0.4, length(uv - 0.5)) * 0.8;

    if (uAlphaParticles < 0.5) {
      if (circle < 0.1) discard;
      gl_FragColor = vec4(vColor, 1.0);
    } else {
      gl_FragColor = vec4(vColor, circle);
    }
  }
`;

function hexToRgb(hex: string): [number, number, number] {
  const sanitized = hex.replace("#", "").padStart(6, "0");
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(sanitized);
  return result
    ? [
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255,
      ]
    : [1, 1, 1];
}

interface ParticlesProps {
  particleCount?: number;
  particleSpread?: number;
  speed?: number;
  particleColors?: string[];
  moveParticlesOnHover?: boolean;
  particleHoverFactor?: number;
  alphaParticles?: boolean;
  particleBaseSize?: number;
  sizeRandomness?: number;
  cameraDistance?: number;
  disableRotation?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function Particles({
  particleCount = 200,
  particleSpread = 10,
  speed = 0.1,
  particleColors = ["#ffffff"],
  moveParticlesOnHover = false,
  particleHoverFactor = 1.6,
  alphaParticles = false,
  particleBaseSize = 150,
  sizeRandomness = 1.1,
  cameraDistance = 20,
  disableRotation = false,
  className,
  style,
}: ParticlesProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new Renderer({ depth: false, alpha: true, antialias: true });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    container.appendChild(gl.canvas);

    (gl.canvas as HTMLCanvasElement).style.position = "absolute";
    (gl.canvas as HTMLCanvasElement).style.inset = "0";
    (gl.canvas as HTMLCanvasElement).style.width = "100%";
    (gl.canvas as HTMLCanvasElement).style.height = "100%";

    const camera = new Camera(gl, { fov: 15 });
    camera.position.set(0, 0, cameraDistance);

    function resize() {
      renderer.setSize(container!.offsetWidth, container!.offsetHeight);
      camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const count = particleCount;
    const positions = new Float32Array(count * 3);
    const randoms = new Float32Array(count * 4);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions.set(
        [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1],
        i * 3
      );
      randoms.set(
        [Math.random(), Math.random(), Math.random(), Math.random()],
        i * 4
      );
      const color = hexToRgb(
        particleColors[Math.floor(Math.random() * particleColors.length)]
      );
      colors.set(color, i * 3);
    }

    const geometry = new Geometry(gl, {
      position: { size: 3, data: positions },
      random: { size: 4, data: randoms },
      color: { size: 3, data: colors },
    });

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uTime: { value: 0 },
        uSpread: { value: particleSpread },
        uBaseSize: { value: particleBaseSize },
        uSizeRandomness: { value: sizeRandomness },
        uAlphaParticles: { value: alphaParticles ? 1 : 0 },
      },
      transparent: true,
      depthTest: false,
    });

    const mesh = new Mesh(gl, { mode: gl.POINTS, geometry, program });

    let animFrameId: number;
    let mouseX = 0;
    let mouseY = 0;

    function onMouseMove(e: MouseEvent) {
      const rect = container!.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * particleHoverFactor;
      mouseY = -((e.clientY - rect.top) / rect.height - 0.5) * particleHoverFactor;
    }

    if (moveParticlesOnHover) {
      container.addEventListener("mousemove", onMouseMove);
    }

    function animate(t: number) {
      animFrameId = requestAnimationFrame(animate);
      const time = t * 0.001 * speed;
      program.uniforms.uTime.value = time;

      if (!disableRotation) {
        mesh.rotation.y += 0.0008 * speed * 10;
        mesh.rotation.x += 0.0003 * speed * 10;
      }

      if (moveParticlesOnHover) {
        mesh.rotation.x += mouseY * 0.02;
        mesh.rotation.y += mouseX * 0.02;
      }

      renderer.render({ scene: mesh, camera });
    }
    animFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameId);
      resizeObserver.disconnect();
      if (moveParticlesOnHover) container.removeEventListener("mousemove", onMouseMove);
      if (container.contains(gl.canvas)) container.removeChild(gl.canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [
    particleCount,
    particleSpread,
    speed,
    particleColors,
    moveParticlesOnHover,
    particleHoverFactor,
    alphaParticles,
    particleBaseSize,
    sizeRandomness,
    cameraDistance,
    disableRotation,
  ]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "absolute", inset: 0, ...style }}
    />
  );
}

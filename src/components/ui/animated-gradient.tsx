"use client";

import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  WebGLErrorBoundary,
  WebGLFallback,
} from "@/components/ui/animated-gradient-utils/webgl-error-boundary";
import { cn } from "@/lib/utils";

type PatternShape = "Checks" | "Stripes" | "Edge";
type PresetName = "Aurora" | "Oceanic" | "Amber" | "Toxic" | "Ghost";

interface PresetParams {
  color1: string;
  color2: string;
  color3: string;
  rotation: number;
  proportion: number;
  scale: number;
  speed: number;
  distortion: number;
  swirl: number;
  swirlIterations: number;
  softness: number;
  offset: number;
  shape: PatternShape;
  shapeSize: number;
}

const patternShapes: Record<PatternShape, number> = {
  Checks: 0,
  Stripes: 1,
  Edge: 2,
};

const presets: Record<PresetName, PresetParams> = {
  Aurora: {
    color1: "#0a001a",
    color2: "#1a0b2e",
    color3: "#f20089",
    rotation: -45,
    proportion: 60,
    scale: 0.6,
    speed: 15,
    distortion: 40,
    swirl: 80,
    swirlIterations: 10,
    softness: 100,
    offset: 200,
    shape: "Edge",
    shapeSize: 50,
  },
  Oceanic: {
    color1: "#000814",
    color2: "#001d3d",
    color3: "#00b4d8",
    rotation: 0,
    proportion: 70,
    scale: 0.4,
    speed: 10,
    distortion: 15,
    swirl: 50,
    swirlIterations: 12,
    softness: 80,
    offset: 150,
    shape: "Checks",
    shapeSize: 30,
  },
  Amber: {
    color1: "#140c00",
    color2: "#4a2500",
    color3: "#f57c00",
    rotation: 120,
    proportion: 80,
    scale: 0.8,
    speed: 20,
    distortion: 25,
    swirl: 60,
    swirlIterations: 8,
    softness: 90,
    offset: 500,
    shape: "Stripes",
    shapeSize: 40,
  },
  Toxic: {
    color1: "#050d05",
    color2: "#0a240a",
    color3: "#39ff14",
    rotation: -90,
    proportion: 55,
    scale: 0.5,
    speed: 25,
    distortion: 60,
    swirl: 100,
    swirlIterations: 15,
    softness: 70,
    offset: -100,
    shape: "Edge",
    shapeSize: 20,
  },
  Ghost: {
    color1: "#0a0a0a",
    color2: "#1c1c1c",
    color3: "#a3a3a3",
    rotation: 45,
    proportion: 50,
    scale: 0.3,
    speed: 8,
    distortion: 10,
    swirl: 30,
    swirlIterations: 5,
    softness: 100,
    offset: 0,
    shape: "Checks",
    shapeSize: 60,
  },
};

export interface CustomConfig {
  preset: "custom";
  color1: string;
  color2: string;
  color3: string;
  rotation?: number;
  proportion?: number;
  scale?: number;
  speed?: number;
  distortion?: number;
  swirl?: number;
  swirlIterations?: number;
  softness?: number;
  offset?: number;
  shape?: PatternShape;
  shapeSize?: number;
}

export interface PresetConfig {
  preset: PresetName;
  speed?: number;
}

export type GradientConfig = CustomConfig | PresetConfig;

export interface AnimatedGradientProps {
  config?: GradientConfig;
  noise?: { opacity: number; scale?: number };
  radius?: string;
  style?: CSSProperties;
  className?: string;
}

export function AnimatedGradient({
  config = { preset: "Aurora" },
  noise,
  radius = "0px",
  style,
  className,
}: AnimatedGradientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);
  const [failed, setFailed] = useState(false);

  const params = useMemo<PresetParams>(() => {
    if (config.preset !== "custom") {
      const preset = presets[config.preset];
      return { ...preset, speed: config.speed ?? preset.speed };
    }

    return {
      color1: config.color1,
      color2: config.color2,
      color3: config.color3,
      rotation: config.rotation ?? 0,
      proportion: config.proportion ?? 35,
      scale: config.scale ?? 1,
      speed: config.speed ?? 25,
      distortion: config.distortion ?? 12,
      swirl: config.swirl ?? 80,
      swirlIterations: config.swirlIterations ?? 10,
      softness: config.softness ?? 100,
      offset: config.offset ?? 0,
      shape: config.shape ?? "Checks",
      shapeSize: config.shapeSize ?? 10,
    };
  }, [config]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || failed) return;

    const gl = canvas.getContext("webgl2", {
      premultipliedAlpha: true,
      alpha: true,
      antialias: true,
    });
    if (!gl) {
      setFailed(true);
      return;
    }

    const vertexShader = createShader(
      gl,
      gl.VERTEX_SHADER,
      `#version 300 es
      in vec4 a_position;
      void main() { gl_Position = a_position; }`,
    );
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertexShader || !fragmentShader) {
      setFailed(true);
      return;
    }

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setFailed(true);
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const uniforms = {
      time: uniform("u_time"),
      resolution: uniform("u_resolution"),
      pixelRatio: uniform("u_pixelRatio"),
      scale: uniform("u_scale"),
      rotation: uniform("u_rotation"),
      color1: uniform("u_color1"),
      color2: uniform("u_color2"),
      color3: uniform("u_color3"),
      proportion: uniform("u_proportion"),
      softness: uniform("u_softness"),
      shape: uniform("u_shape"),
      shapeScale: uniform("u_shapeScale"),
      distortion: uniform("u_distortion"),
      swirl: uniform("u_swirl"),
      swirlIterations: uniform("u_swirlIterations"),
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = container.clientWidth * ratio;
      canvas.height = container.clientHeight * ratio;
      canvas.style.width = `${container.clientWidth}px`;
      canvas.style.height = `${container.clientHeight}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const start = performance.now();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const draw = (time: number) => {
      const elapsed = reducedMotion ? 0 : (time - start) / 1000;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const [r1, g1, b1, a1] = hexToRgba(params.color1);
      const [r2, g2, b2, a2] = hexToRgba(params.color2);
      const [r3, g3, b3, a3] = hexToRgba(params.color3);

      gl.uniform1f(uniforms.time, elapsed * ((params.speed / 100) * 5) + params.offset * 0.01);
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.pixelRatio, ratio);
      gl.uniform1f(uniforms.scale, params.scale);
      gl.uniform1f(uniforms.rotation, (params.rotation * Math.PI) / 180);
      gl.uniform4f(uniforms.color1, r1, g1, b1, a1);
      gl.uniform4f(uniforms.color2, r2, g2, b2, a2);
      gl.uniform4f(uniforms.color3, r3, g3, b3, a3);
      gl.uniform1f(uniforms.proportion, params.proportion / 100);
      gl.uniform1f(uniforms.softness, params.softness / 100);
      gl.uniform1f(uniforms.shape, patternShapes[params.shape]);
      gl.uniform1f(uniforms.shapeScale, params.shapeSize / 100);
      gl.uniform1f(uniforms.distortion, params.distortion / 50);
      gl.uniform1f(uniforms.swirl, params.swirl / 100);
      gl.uniform1f(uniforms.swirlIterations, params.swirl === 0 ? 0 : params.swirlIterations);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!reducedMotion) frameRef.current = requestAnimationFrame(draw);
    };
    frameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameRef.current);
      observer.disconnect();
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, [failed, params]);

  if (failed) return <WebGLFallback className={cn("absolute inset-0", className)} />;

  return (
    <WebGLErrorBoundary
      fallback={<WebGLFallback className={cn("absolute inset-0", className)} />}
    >
      <div
        ref={containerRef}
        className={cn("absolute inset-0 overflow-hidden", className)}
        style={{ borderRadius: radius, ...style }}
      >
        <canvas ref={canvasRef} className="animated-gradient-canvas" />
        {noise && noise.opacity > 0 && (
          <div
            className="animated-gradient-noise"
            style={{ opacity: noise.opacity / 2, backgroundSize: (noise.scale ?? 1) * 200 }}
          />
        )}
      </div>
    </WebGLErrorBoundary>
  );
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

function hexToRgba(hex: string): [number, number, number, number] {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  return [
    Number.parseInt(full.slice(0, 2), 16) / 255,
    Number.parseInt(full.slice(2, 4), 16) / 255,
    Number.parseInt(full.slice(4, 6), 16) / 255,
    1,
  ];
}

const fragmentSource = `#version 300 es
precision highp float;
uniform float u_time;
uniform float u_pixelRatio;
uniform vec2 u_resolution;
uniform float u_scale;
uniform float u_rotation;
uniform vec4 u_color1;
uniform vec4 u_color2;
uniform vec4 u_color3;
uniform float u_proportion;
uniform float u_softness;
uniform float u_shape;
uniform float u_shapeScale;
uniform float u_distortion;
uniform float u_swirl;
uniform float u_swirlIterations;
out vec4 fragColor;
#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846
vec2 rotate(vec2 uv, float th) { return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv; }
float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); }
float noise(vec2 st) {
  vec2 i = floor(st); vec2 f = fract(st);
  float a = random(i); float b = random(i + vec2(1., 0.));
  float c = random(i + vec2(0., 1.)); float d = random(i + vec2(1., 1.));
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
vec4 blendColors(vec4 c1, vec4 c2, vec4 c3, float mixer, float width, float blur) {
  float r1 = smoothstep(.35 * width, .7 - .35 * width + .5 * blur, mixer);
  float r2 = smoothstep(.3 + .35 * width, 1. - .35 * width + blur, mixer);
  vec3 mixed = mix(c1.rgb * c1.a, c2.rgb * c2.a, r1);
  return vec4(mix(mixed, c3.rgb * c3.a, r2), mix(mix(c1.a, c2.a, r1), c3.a, r2));
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = .5 * u_time;
  float noiseScale = .0005 + .006 * u_scale;
  uv -= .5;
  uv *= noiseScale * u_resolution;
  uv = rotate(uv, u_rotation * .5 * PI);
  uv /= u_pixelRatio;
  uv += .5;
  float n1 = noise(uv + t);
  float n2 = noise(uv * 2. - t);
  float angle = n1 * TWO_PI;
  uv += 4. * u_distortion * n2 * vec2(cos(angle), sin(angle));
  float iterations = ceil(clamp(u_swirlIterations, 1., 30.));
  for (float i = 1.; i <= iterations; i++) {
    uv.x += clamp(u_swirl, 0., 2.) / i * cos(t + i * 1.5 * uv.y);
    uv.y += clamp(u_swirl, 0., 2.) / i * cos(t + i * uv.x);
  }
  float mixer;
  if (u_shape < .5) {
    vec2 checks = uv * (.5 + 3.5 * u_shapeScale);
    float shape = .5 + .5 * sin(checks.x) * cos(checks.y);
    mixer = shape + .48 * sign(u_proportion - .5) * pow(abs(u_proportion - .5), .5);
  } else if (u_shape < 1.5) {
    float stripe = fract((uv * (.25 + 3. * u_shapeScale)).y);
    float shape = smoothstep(0., .55, stripe) * smoothstep(1., .45, stripe);
    mixer = shape + .48 * sign(u_proportion - .5) * pow(abs(u_proportion - .5), .5);
  } else {
    float shape = (1. - uv.y - .5) / (noiseScale * u_resolution.y) + .5;
    float shapeScaling = .2 * (1. - u_shapeScale);
    mixer = smoothstep(.45 - shapeScaling, .55 + shapeScaling, shape + .3 * (u_proportion - .5));
  }
  fragColor = blendColors(u_color1, u_color2, u_color3, mixer, 1. - clamp(u_softness, 0., 1.), .01 + .01 * u_scale);
}`;

export default AnimatedGradient;

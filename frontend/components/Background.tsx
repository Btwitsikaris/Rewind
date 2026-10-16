"use client";
import { useEffect, useRef } from "react";

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `precision highp float;
uniform float uTime; uniform vec2 uRes; uniform vec2 uMouse; uniform float uPx;
float blob(vec2 p, vec2 c, vec2 r){ vec2 d = (p - c) / r; return exp(-dot(d, d)); }
void main(){
  vec2 frag = gl_FragCoord.xy; vec2 uv = frag / uRes; float a = uRes.x / uRes.y; vec2 p = vec2(uv.x * a, uv.y);
  float t = uTime * 0.35; float w = 0.45 * a + 0.12;
  float b1 = blob(p, vec2(a * (0.10 + 0.14 * sin(t * 0.9)),       0.14 + 0.05 * sin(t * 1.3)), vec2(w, 0.20));
  float b2 = blob(p, vec2(a * (0.50 + 0.22 * sin(t * 0.7 + 2.0)), 0.06 + 0.05 * sin(t * 1.1 + 1.0)), vec2(w, 0.15));
  float b3 = blob(p, vec2(a * (0.90 + 0.12 * sin(t * 0.8 + 4.0)), 0.16 + 0.06 * sin(t * 1.2 + 3.0)), vec2(w, 0.22));
  float b4 = blob(p, vec2(uMouse.x * a, uMouse.y), vec2(0.28 * min(a, 1.2) + 0.1, 0.22)) * 0.55;
  vec3 violet = vec3(0.90, 0.10, 0.20), blue = vec3(1.0, 0.20, 0.25), teal = vec3(0.60, 0.08, 0.22);
  vec3 glow = violet * b1 + blue * b2 + mix(blue, teal, 0.5) * b3 + mix(violet, blue, 0.5) * b4;
  glow *= 0.8;
  float gi = clamp(max(glow.r, max(glow.g, glow.b)), 0.0, 1.0);
  float S = 16.0 * uPx; vec2 cell = mod(frag, S) - 0.5 * S;
  float dotMask = smoothstep(0.9 * uPx, 0.3 * uPx, length(cell));
  vec3 dotCol = mix(vec3(0.30), vec3(1.0, 0.80, 0.82), gi);
  gl_FragColor = vec4(glow + dotMask * dotCol * 0.5, 1.0);
}`;

export default function Background() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl");
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "uTime");
    const uRes = gl.getUniformLocation(prog, "uRes");
    const uMouse = gl.getUniformLocation(prog, "uMouse");
    const uPx = gl.getUniformLocation(prog, "uPx");

    const px = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * px);
      canvas.height = Math.floor(window.innerHeight * px);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const mouse = { x: 0.5, y: 0.1 };
    const target = { x: 0.5, y: 0.1 };
    const onMove = (e: PointerEvent) => {
      target.x = e.clientX / window.innerWidth;
      target.y = 1 - e.clientY / window.innerHeight;
    };
    window.addEventListener("pointermove", onMove);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let t = 0;
    let last = performance.now();
    const frame = (now: number) => {
      if (!reduce) t += (now - last) / 1000;
      last = now;
      mouse.x += (target.x - mouse.x) * 0.05;
      mouse.y += (target.y - mouse.y) * 0.05;
      gl.uniform1f(uTime, t);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMouse, mouse.x, Math.min(mouse.y, 0.4));
      gl.uniform1f(uPx, px);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={ref} className="bg" aria-hidden="true" />;
}
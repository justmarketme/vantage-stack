"use client";

// Track A/CanvasCompositor — Isabel's green-screen intro as a transparent
// "hologram", chroma-keyed in real time with WebGL.
//
// LITE by design so the page moves effortlessly:
//   • preload="none" — the ~2MB clip is NOT fetched until we start it
//   • deferred start — begins only after the page is idle (requestIdleCallback)
//   • efficient render — requestVideoFrameCallback (fires per decoded frame),
//     throttled rAF fallback (~30fps), never a full 60fps spin
//   • pauses video + rendering when the tab is hidden
//   • hidden below xl (mobile gets Isabel via the chat widget instead)
//
// Falls back to nothing without WebGL; respects prefers-reduced-motion (one
// static keyed frame).

import { useEffect, useRef, useState } from "react";

const DEFAULT_SRC = "/videos/isabel_intro.mp4";

const VERTEX_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2((a_pos.x + 1.0) * 0.5, 1.0 - (a_pos.y + 1.0) * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAGMENT_SRC = `
precision mediump float;
uniform sampler2D u_tex;
varying vec2 v_uv;
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  // "Greenness" — how much green exceeds the stronger of red/blue. The screen is
  // a muted green (~rgb 67,135,85) so key ~0.1-0.2; Isabel (skin/navy/hair) is
  // always < 0, giving a clean separation.
  float key = c.g - max(c.r, c.b);
  // Remove the green fully (incl. shaded areas) with a soft edge.
  float alpha = 1.0 - smoothstep(0.015, 0.10, key);
  // De-spill: never let green exceed the other channels → kills the green fringe.
  c.g = min(c.g, max(c.r, c.b));
  gl_FragColor = vec4(c.rgb, alpha);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

type RVFCVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

export function IsabelOverlay({
  src = DEFAULT_SRC,
  className = "",
  fadeMs = 900,
  onReady,
}: {
  src?: string;
  className?: string;
  fadeMs?: number;
  onReady?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<RVFCVideo | null>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const gl = canvas.getContext("webgl", { premultipliedAlpha: false, alpha: true, preserveDrawingBuffer: true });
    if (!gl) {
      setFailed(true);
      return;
    }
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    const program = gl.createProgram();
    if (!vs || !fs || !program) {
      setFailed(true);
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setFailed(true);
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    // NO blending: the full-screen quad writes straight (un-premultiplied) RGBA
    // directly, fully overwriting every pixel each frame. Blending against the
    // un-cleared previous frame is what produced the "ghost trail" that followed
    // Isabel's arm as she moved. We also clear each frame as belt-and-braces.
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const useRVFC = typeof video.requestVideoFrameCallback === "function";
    let drewOnce = false;
    let rafId: number | null = null;
    let rvfcId: number | null = null;
    let lastT = 0;
    const FRAME_MS = 1000 / 30; // throttle the rAF fallback to ~30fps
    let stopped = false;

    const renderFrame = () => {
      if (video.readyState < 2) return;
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!drewOnce) {
        drewOnce = true;
        setVisible(true);
        onReady?.();
      }
    };

    const stopLoop = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (rvfcId !== null && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(rvfcId);
      rafId = rvfcId = null;
    };

    const loop = (t?: number) => {
      if (stopped) return;
      if (useRVFC) {
        renderFrame();
        rvfcId = video.requestVideoFrameCallback!(() => loop());
      } else {
        rafId = requestAnimationFrame(loop);
        if ((t ?? 0) - lastT < FRAME_MS) return;
        lastT = t ?? 0;
        renderFrame();
      }
    };

    const begin = () => {
      if (stopped) return;
      video.play().catch(() => {});
      renderFrame(); // instant first paint
      if (!reduce) loop();
    };

    // Defer start until the page is idle so it never competes with first render.
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const hasIdle = typeof w.requestIdleCallback === "function";
    const startTimer = hasIdle ? w.requestIdleCallback!(begin, { timeout: 1500 }) : window.setTimeout(begin, 600);

    const onVisibility = () => {
      if (document.hidden) {
        video.pause();
        stopLoop();
      } else if (!reduce && drewOnce) {
        video.play().catch(() => {});
        loop();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      stopLoop();
      if (hasIdle) w.cancelIdleCallback?.(startTimer);
      else window.clearTimeout(startTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      video.pause();
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [src, onReady]);

  if (failed) return null;

  return (
    <div className={className} aria-hidden="true">
      {/* Rendered (not display:none) so frames decode, but off-screen + invisible. */}
      <video
        ref={videoRef}
        src={src}
        muted
        loop
        playsInline
        preload="none"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />
      <canvas
        ref={canvasRef}
        className="h-full w-full object-contain transition-opacity"
        style={{ opacity: visible ? 1 : 0, transitionDuration: `${fadeMs}ms` }}
      />
    </div>
  );
}

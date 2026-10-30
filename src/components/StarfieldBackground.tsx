import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  phase: number;
  drift: number;
  color: "white" | "cyan";
};

const makeStar = (): Star => ({
  x: Math.random(),
  y: Math.random(),
  radius: 0.45 + Math.random() * 1.25,
  alpha: 0.32 + Math.random() * 0.55,
  phase: Math.random() * Math.PI * 2,
  drift: 1.5 + Math.random() * 5,
  color: Math.random() > 0.72 ? "cyan" : "white",
});

/** Lightweight, artifact-free moving star field for the sign-in background. */
export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointer = { x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5 };
    let width = 1;
    let height = 1;
    let ratio = 1;
    let stars: Star[] = [];
    let frame = 0;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.max(58, Math.min(130, Math.round((width * height) / 11500)));
      stars = Array.from({ length: count }, makeStar);
    };

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);
      pointer.x += (pointer.targetX - pointer.x) * 0.025;
      pointer.y += (pointer.targetY - pointer.y) * 0.025;
      const parallaxX = (pointer.x - 0.5) * 14;
      const parallaxY = (pointer.y - 0.5) * 10;

      for (const star of stars) {
        const movement = reducedMotion ? 0 : Math.sin(time * 0.00038 + star.phase) * star.drift;
        const x = star.x * width + movement + parallaxX * star.radius;
        const y = star.y * height + Math.cos(time * 0.00031 + star.phase) * star.drift + parallaxY * star.radius;
        const twinkle = reducedMotion ? 1 : 0.72 + Math.sin(time * 0.0022 + star.phase) * 0.28;
        const alpha = star.alpha * twinkle;
        const core = star.color === "cyan" ? "159, 244, 255" : "244, 253, 255";
        const glow = context.createRadialGradient(x, y, 0, x, y, star.radius * 6);
        glow.addColorStop(0, `rgba(${core}, ${alpha})`);
        glow.addColorStop(0.18, `rgba(${core}, ${alpha * 0.55})`);
        glow.addColorStop(1, `rgba(${core}, 0)`);
        context.fillStyle = glow;
        context.beginPath();
        context.arc(x, y, star.radius * 6, 0, Math.PI * 2);
        context.fill();
      }

      if (!reducedMotion) frame = window.requestAnimationFrame(draw);
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer.targetX = event.clientX / Math.max(window.innerWidth, 1);
      pointer.targetY = event.clientY / Math.max(window.innerHeight, 1);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    draw(performance.now());

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />;
}

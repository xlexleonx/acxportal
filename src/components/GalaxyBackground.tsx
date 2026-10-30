import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  z: number;
  size: number;
  tint: number;
};

const palette = ["#ecfeff", "#74f9ff", "#21dfd0", "#8ab4ff", "#ffffff"];

const createStar = (): Star => ({
  x: Math.random() * 2 - 1,
  y: Math.random() * 2 - 1,
  z: Math.random(),
  size: 0.45 + Math.random() * 1.45,
  tint: Math.floor(Math.random() * palette.length),
});

/** A light Canvas implementation of the Galaxy-style starfield for the sign-in screen. */
export default function GalaxyBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let frame = 0;
    let width = 0;
    let height = 0;
    let ratio = 1;
    let stars: Star[] = [];
    let animationFrame = 0;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.max(130, Math.min(360, Math.round((width * height) / 6500)));
      stars = Array.from({ length: count }, createStar);
    };

    const draw = () => {
      frame += 1;
      const centerX = width / 2;
      const centerY = height / 2;
      const pointerX = (pointer.x - centerX) / Math.max(width, 1);
      const pointerY = (pointer.y - centerY) / Math.max(height, 1);

      const background = context.createRadialGradient(
        width * 0.52,
        height * 0.42,
        0,
        width * 0.52,
        height * 0.42,
        Math.max(width, height) * 0.75,
      );
      background.addColorStop(0, "#082d48");
      background.addColorStop(0.42, "#041b31");
      background.addColorStop(1, "#010711");
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      const nebula = context.createRadialGradient(width * 0.82, height * 0.72, 0, width * 0.82, height * 0.72, width * 0.48);
      nebula.addColorStop(0, "rgba(0, 220, 197, 0.10)");
      nebula.addColorStop(1, "rgba(0, 220, 197, 0)");
      context.fillStyle = nebula;
      context.fillRect(0, 0, width, height);

      for (const star of stars) {
        const previousZ = star.z;
        if (!reducedMotion) star.z -= 0.0034;
        if (star.z <= 0.025) Object.assign(star, createStar(), { z: 1 });

        const depth = 1 / star.z;
        const previousDepth = 1 / Math.min(previousZ, 1);
        const shift = (1 - star.z) * 42;
        const x = centerX + star.x * width * depth * 0.34 + pointerX * shift;
        const y = centerY + star.y * height * depth * 0.34 + pointerY * shift;
        const previousX = centerX + star.x * width * previousDepth * 0.34 + pointerX * shift;
        const previousY = centerY + star.y * height * previousDepth * 0.34 + pointerY * shift;

        if (x < -40 || x > width + 40 || y < -40 || y > height + 40) {
          Object.assign(star, createStar(), { z: 1 });
          continue;
        }

        const alpha = Math.min(0.9, 0.18 + (1 - star.z) * 0.82);
        context.strokeStyle = `${palette[star.tint]}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
        context.lineWidth = Math.max(0.35, star.size * (1 - star.z) * 1.6);
        context.beginPath();
        context.moveTo(previousX, previousY);
        context.lineTo(x, y);
        context.stroke();

        if (frame % 2 === 0 || star.z < 0.28) {
          context.fillStyle = `${palette[star.tint]}${Math.round(Math.min(1, alpha + 0.12) * 255).toString(16).padStart(2, "0")}`;
          context.beginPath();
          context.arc(x, y, Math.max(0.45, star.size * (1 - star.z) * 1.75), 0, Math.PI * 2);
          context.fill();
        }
      }

      if (!reducedMotion) animationFrame = window.requestAnimationFrame(draw);
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    draw();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 h-full w-full" />;
}

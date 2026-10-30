import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  z: number;
  size: number;
  layer: number;
  phase: number;
};

// Values reproduce the selected Galaxy preset from the supplied screenshot.
const galaxySettings = Object.freeze({
  preset: "Classic",
  starColors: "Hue Shift",
  hueShift: 194,
  saturation: 0,
  density: 1,
  glow: 0.3,
  starSize: 1,
  flares: 1,
  twinkle: 0.3,
  starSpeed: 0.5,
  speed: 1,
  rotationSpeed: 0.1,
  layers: 4,
  direction: "forward" as const,
  mouseInteraction: true,
  mouseRepulsion: true,
  repulsionStrength: 2,
  clickWarp: true,
  intro: true,
  lightMode: false,
});

const createStar = (): Star => ({
  x: Math.random() * 2 - 1,
  y: Math.random() * 2 - 1,
  z: Math.random(),
  size: 0.45 + Math.random() * 1.45,
  layer: Math.floor(Math.random() * galaxySettings.layers),
  phase: Math.random() * Math.PI * 2,
});

const starColor = (lightness: number) =>
  `hsl(${galaxySettings.hueShift} ${galaxySettings.saturation}% ${lightness}%)`;

/** Canvas background tuned to the requested React Bits Galaxy settings. */
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
    let warp = 0;
    let introProgress = galaxySettings.intro ? 0 : 1;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.max(130, Math.min(360, Math.round((width * height * galaxySettings.density) / 6500)));
      stars = Array.from({ length: count }, createStar);
    };

    const draw = () => {
      frame += 1;
      introProgress = Math.min(1, introProgress + 0.016);
      warp *= 0.94;

      const centerX = width / 2;
      const centerY = height / 2;
      const pointerX = (pointer.x - centerX) / Math.max(width, 1);
      const pointerY = (pointer.y - centerY) / Math.max(height, 1);
      const rotation = frame * 0.00007 * galaxySettings.rotationSpeed;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const background = context.createRadialGradient(
        width * 0.52,
        height * 0.42,
        0,
        width * 0.52,
        height * 0.42,
        Math.max(width, height) * 0.75,
      );
      background.addColorStop(0, galaxySettings.lightMode ? "#e7f7ff" : "#082d48");
      background.addColorStop(0.42, galaxySettings.lightMode ? "#c7e8f4" : "#041b31");
      background.addColorStop(1, galaxySettings.lightMode ? "#b8dce9" : "#010711");
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      const nebula = context.createRadialGradient(width * 0.82, height * 0.72, 0, width * 0.82, height * 0.72, width * 0.48);
      nebula.addColorStop(0, "rgba(0, 220, 197, 0.10)");
      nebula.addColorStop(1, "rgba(0, 220, 197, 0)");
      context.fillStyle = nebula;
      context.fillRect(0, 0, width, height);

      for (const star of stars) {
        const previousZ = star.z;
        const layerSpeed = 0.75 + (star.layer + 1) * 0.125;
        const warpMultiplier = 1 + warp * 5;
        const step = 0.0034 * galaxySettings.starSpeed * galaxySettings.speed * layerSpeed * warpMultiplier * introProgress;
        if (!reducedMotion) star.z += galaxySettings.direction === "forward" ? -step : step;

        if (star.z <= 0.025 || star.z >= 1.02) {
          Object.assign(star, createStar(), { z: galaxySettings.direction === "forward" ? 1 : 0.03 });
          continue;
        }

        const rotatedX = star.x * cos - star.y * sin;
        const rotatedY = star.x * sin + star.y * cos;
        const depth = 1 / star.z;
        const previousDepth = 1 / Math.min(previousZ, 1);
        const shift = galaxySettings.mouseInteraction ? (1 - star.z) * 42 : 0;
        let x = centerX + rotatedX * width * depth * 0.34 + pointerX * shift;
        let y = centerY + rotatedY * height * depth * 0.34 + pointerY * shift;
        const previousX = centerX + rotatedX * width * previousDepth * 0.34 + pointerX * shift;
        const previousY = centerY + rotatedY * height * previousDepth * 0.34 + pointerY * shift;

        if (galaxySettings.mouseRepulsion && !reducedMotion) {
          const deltaX = x - pointer.x;
          const deltaY = y - pointer.y;
          const distance = Math.hypot(deltaX, deltaY) || 1;
          const radius = 190;
          if (distance < radius) {
            const force = ((radius - distance) / radius) ** 2 * galaxySettings.repulsionStrength * 28;
            x += (deltaX / distance) * force;
            y += (deltaY / distance) * force;
          }
        }

        if (x < -40 || x > width + 40 || y < -40 || y > height + 40) {
          Object.assign(star, createStar(), { z: 1 });
          continue;
        }

        const twinkle = 1 - galaxySettings.twinkle + ((Math.sin(frame * 0.075 + star.phase) + 1) / 2) * galaxySettings.twinkle;
        const alpha = Math.min(0.9, (0.18 + (1 - star.z) * 0.82) * twinkle);
        const color = starColor(94 + star.layer);
        const lineWidth = Math.max(0.35, star.size * galaxySettings.starSize * (1 - star.z) * 1.6);

        context.save();
        context.shadowBlur = 18 * galaxySettings.glow * (1 - star.z);
        context.shadowColor = color;
        context.strokeStyle = color;
        context.globalAlpha = alpha;
        context.lineWidth = lineWidth;
        context.beginPath();
        context.moveTo(previousX, previousY);
        context.lineTo(x, y);
        context.stroke();

        context.fillStyle = color;
        context.beginPath();
        context.arc(x, y, Math.max(0.45, star.size * galaxySettings.starSize * (1 - star.z) * 1.75), 0, Math.PI * 2);
        context.fill();

        if (galaxySettings.flares > 0 && star.z < 0.18 && star.size > 1.45) {
          const flare = 2 + (1 - star.z) * 5 * galaxySettings.flares;
          context.lineWidth = 0.55;
          context.beginPath();
          context.moveTo(x - flare, y);
          context.lineTo(x + flare, y);
          context.moveTo(x, y - flare);
          context.lineTo(x, y + flare);
          context.stroke();
        }
        context.restore();
      }

      if (!reducedMotion) animationFrame = window.requestAnimationFrame(draw);
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    const onClick = () => {
      if (galaxySettings.clickWarp && !reducedMotion) warp = 1;
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("click", onClick, { passive: true });
    draw();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("click", onClick);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 h-full w-full" />;
}

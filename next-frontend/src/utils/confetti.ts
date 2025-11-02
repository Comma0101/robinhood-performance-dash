import confetti from "canvas-confetti";

export const triggerConfetti = (
  type: "success" | "celebration" | "subtle" = "success"
) => {
  const duration = 3000;
  const animationEnd = Date.now() + duration;

  const colors = {
    success: ["#10b981", "#34d399", "#6ee7b7"],
    celebration: ["#3b82f6", "#60a5fa", "#93c5fd", "#fbbf24", "#fcd34d"],
    subtle: ["#3b82f6", "#60a5fa"],
  };

  const selectedColors = colors[type];

  const frame = () => {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return;
    }

    const particleCount = type === "celebration" ? 3 : 2;

    confetti({
      particleCount,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.6 },
      colors: selectedColors,
    });

    confetti({
      particleCount,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.6 },
      colors: selectedColors,
    });

    requestAnimationFrame(frame);
  };

  frame();
};

export const triggerBurst = () => {
  const count = 200;
  const defaults = {
    origin: { y: 0.7 },
    colors: ["#10b981", "#34d399", "#6ee7b7", "#3b82f6", "#60a5fa"],
  };

  function fire(particleRatio: number, opts: confetti.Options) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  fire(0.25, {
    spread: 26,
    startVelocity: 55,
  });

  fire(0.2, {
    spread: 60,
  });

  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
  });

  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
  });

  fire(0.1, {
    spread: 120,
    startVelocity: 45,
  });
};

export const triggerFireworks = () => {
  const duration = 5000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

  function randomInRange(min: number, max: number) {
    return Math.random() * (max - min) + min;
  }

  const interval = setInterval(function () {
    const timeLeft = animationEnd - Date.now();

    if (timeLeft <= 0) {
      return clearInterval(interval);
    }

    const particleCount = 50 * (timeLeft / duration);

    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      colors: ["#10b981", "#34d399", "#6ee7b7"],
    });

    confetti({
      ...defaults,
      particleCount,
      origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      colors: ["#3b82f6", "#60a5fa", "#93c5fd"],
    });
  }, 250);
};

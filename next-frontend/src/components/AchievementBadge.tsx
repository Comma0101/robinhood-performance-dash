import React from "react";
import { Achievement } from "@/utils/achievements";

interface AchievementBadgeProps {
  achievement: Achievement;
  unlocked: boolean;
  progress?: { current: number; target: number };
  size?: "small" | "medium" | "large";
  showProgress?: boolean;
}

export default function AchievementBadge({
  achievement,
  unlocked,
  progress,
  size = "medium",
  showProgress = false,
}: AchievementBadgeProps) {
  const getTierColor = (tier: string) => {
    switch (tier) {
      case "bronze":
        return "from-amber-900 to-amber-700";
      case "silver":
        return "from-gray-600 to-gray-400";
      case "gold":
        return "from-yellow-600 to-yellow-400";
      case "platinum":
        return "from-cyan-600 to-cyan-400";
      default:
        return "from-gray-700 to-gray-600";
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case "small":
        return "p-3 min-w-[120px]";
      case "large":
        return "p-6 min-w-[200px]";
      default:
        return "p-4 min-w-[160px]";
    }
  };

  const getIconSize = () => {
    switch (size) {
      case "small":
        return "text-3xl";
      case "large":
        return "text-6xl";
      default:
        return "text-4xl";
    }
  };

  const progressPercentage = progress
    ? Math.min((progress.current / progress.target) * 100, 100)
    : 0;

  return (
    <div
      className={`relative ${getSizeClasses()} rounded-lg border transition-all duration-300 ${
        unlocked
          ? `bg-gradient-to-br ${getTierColor(
              achievement.tier
            )} border-transparent shadow-lg hover:scale-105`
          : "bg-bg-elevated border-border-subtle hover:border-border-default opacity-60"
      }`}
      style={{
        filter: unlocked ? "none" : "grayscale(100%)",
      }}
    >
      {/* Tier Badge */}
      {unlocked && (
        <div className="absolute top-2 right-2">
          <div
            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              achievement.tier === "bronze"
                ? "bg-amber-950/50 text-amber-200"
                : achievement.tier === "silver"
                ? "bg-gray-800/50 text-gray-200"
                : achievement.tier === "gold"
                ? "bg-yellow-900/50 text-yellow-100"
                : "bg-cyan-900/50 text-cyan-100"
            }`}
          >
            {achievement.tier.toUpperCase()}
          </div>
        </div>
      )}

      {/* Icon */}
      <div className={`${getIconSize()} mb-2 text-center`}>
        {achievement.icon}
      </div>

      {/* Title */}
      <h3
        className={`font-semibold mb-1 text-center ${
          size === "small"
            ? "text-sm"
            : size === "large"
            ? "text-xl"
            : "text-base"
        } ${unlocked ? "text-white" : "text-text-primary"}`}
      >
        {achievement.title}
      </h3>

      {/* Description */}
      <p
        className={`text-center ${size === "small" ? "text-xs" : "text-sm"} ${
          unlocked ? "text-white/80" : "text-text-secondary"
        }`}
      >
        {achievement.description}
      </p>

      {/* Progress Bar */}
      {showProgress && !unlocked && progress && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-text-tertiary mb-1">
            <span>Progress</span>
            <span>
              {progress.current} / {progress.target}
            </span>
          </div>
          <div className="h-2 bg-bg-base rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Locked Overlay Icon */}
      {!unlocked && !showProgress && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
          <div className="text-4xl opacity-50">🔒</div>
        </div>
      )}
    </div>
  );
}

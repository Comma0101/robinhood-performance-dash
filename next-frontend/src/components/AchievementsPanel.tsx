import React, { useState } from "react";
import {
  Achievement,
  ACHIEVEMENTS,
  checkAchievements,
  Trade,
} from "@/utils/achievements";
import AchievementBadge from "./AchievementBadge";

interface AchievementsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  trades: Trade[];
  summary: any;
  unlockedIds: string[];
}

export default function AchievementsPanel({
  isOpen,
  onClose,
  trades,
  summary,
  unlockedIds,
}: AchievementsPanelProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  if (!isOpen) return null;

  const { unlocked, locked } = checkAchievements(trades, summary);

  // Group achievements by category
  const categories = [
    { id: "all", label: "All", icon: "🏆" },
    { id: "milestone", label: "Milestones", icon: "🎯" },
    { id: "profit", label: "Profit", icon: "💰" },
    { id: "trades", label: "Volume", icon: "📈" },
    { id: "streak", label: "Streaks", icon: "🔥" },
    { id: "winrate", label: "Win Rate", icon: "🌟" },
  ];

  const filteredUnlocked =
    selectedCategory === "all"
      ? unlocked
      : unlocked.filter((a) => a.category === selectedCategory);

  const filteredLocked =
    selectedCategory === "all"
      ? locked
      : locked.filter((a) => a.category === selectedCategory);

  const completionPercentage = Math.round(
    (unlocked.length / ACHIEVEMENTS.length) * 100
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: "900px", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose}>
          ×
        </button>

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Achievements</h2>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex justify-between text-sm text-text-secondary mb-2">
                <span>Progress</span>
                <span className="font-semibold">
                  {unlocked.length} / {ACHIEVEMENTS.length}
                </span>
              </div>
              <div className="h-3 bg-bg-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-success transition-all duration-500"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
            </div>
            <div className="text-3xl font-bold text-primary">
              {completionPercentage}%
            </div>
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? "bg-primary text-white"
                  : "bg-bg-elevated text-text-secondary hover:bg-bg-surface hover:text-text-primary"
              }`}
            >
              <span className="mr-2">{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>

        {/* Achievements Grid */}
        <div className="overflow-y-auto" style={{ maxHeight: "60vh" }}>
          {/* Unlocked Achievements */}
          {filteredUnlocked.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-4 text-success-text flex items-center gap-2">
                <span>✨</span>
                Unlocked ({filteredUnlocked.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {filteredUnlocked.map((achievement) => (
                  <AchievementBadge
                    key={achievement.id}
                    achievement={achievement}
                    unlocked={true}
                    size="medium"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Locked Achievements */}
          {filteredLocked.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4 text-text-tertiary flex items-center gap-2">
                <span>🔒</span>
                Locked ({filteredLocked.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {filteredLocked.map((achievement) => {
                  const progress = achievement.progress
                    ? achievement.progress(trades, summary)
                    : undefined;
                  return (
                    <AchievementBadge
                      key={achievement.id}
                      achievement={achievement}
                      unlocked={false}
                      progress={progress}
                      showProgress={true}
                      size="medium"
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty State */}
          {filteredUnlocked.length === 0 && filteredLocked.length === 0 && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🎯</div>
              <p className="text-text-secondary">
                No achievements in this category yet.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

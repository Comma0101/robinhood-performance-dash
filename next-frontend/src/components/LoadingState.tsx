"use client";

import React from "react";

interface LoadingStateProps {
  text?: string;
}

const LoadingState: React.FC<LoadingStateProps> = ({
  text = "Loading data...",
}) => {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        {/* Animated spinner */}
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-2 border-border-default"></div>
          <div
            className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"
            style={{ animationDuration: "0.8s" }}
          ></div>
        </div>

        {/* Loading text */}
        <p className="text-sm text-text-secondary font-medium">{text}</p>
      </div>
    </div>
  );
};

export default LoadingState;

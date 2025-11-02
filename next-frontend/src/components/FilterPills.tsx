"use client";

import React from "react";

interface FilterPill {
  id: string;
  label: string;
  value: string;
  removable?: boolean;
}

interface FilterPillsProps {
  pills: FilterPill[];
  onRemove: (id: string) => void;
}

export default function FilterPills({ pills, onRemove }: FilterPillsProps) {
  if (pills.length === 0) return null;

  return (
    <div className="filter-pills-container">
      {pills.map((pill) => (
        <div key={pill.id} className="filter-pill active">
          <span>
            {pill.label}: {pill.value}
          </span>
          {pill.removable !== false && (
            <button
              className="filter-pill-remove"
              onClick={() => onRemove(pill.id)}
              aria-label={`Remove ${pill.label} filter`}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M10.5 3.5L3.5 10.5M3.5 3.5L10.5 10.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

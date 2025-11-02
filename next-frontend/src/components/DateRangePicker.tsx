"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  format,
  subDays,
  startOfWeek,
  startOfMonth,
  startOfYear,
} from "date-fns";

interface DateRangePickerProps {
  startDate: Date | null;
  endDate: Date | null;
  onChange: (start: Date | null, end: Date | null) => void;
}

const QUICK_RANGES = [
  { label: "Today", getValue: () => ({ start: new Date(), end: new Date() }) },
  {
    label: "Last 7 days",
    getValue: () => ({ start: subDays(new Date(), 7), end: new Date() }),
  },
  {
    label: "Last 30 days",
    getValue: () => ({ start: subDays(new Date(), 30), end: new Date() }),
  },
  {
    label: "This Week",
    getValue: () => ({ start: startOfWeek(new Date()), end: new Date() }),
  },
  {
    label: "This Month",
    getValue: () => ({ start: startOfMonth(new Date()), end: new Date() }),
  },
  {
    label: "This Year",
    getValue: () => ({ start: startOfYear(new Date()), end: new Date() }),
  },
  { label: "All Time", getValue: () => ({ start: null, end: null }) },
];

export default function DateRangePicker({
  startDate,
  endDate,
  onChange,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleQuickRange = (range: (typeof QUICK_RANGES)[0]) => {
    const { start, end } = range.getValue();
    onChange(start, end);
    setIsOpen(false);
  };

  const getDisplayText = () => {
    if (!startDate && !endDate) return "All Time";
    if (startDate && endDate) {
      if (format(startDate, "yyyy-MM-dd") === format(endDate, "yyyy-MM-dd")) {
        return format(startDate, "MMM d, yyyy");
      }
      return `${format(startDate, "MMM d")} - ${format(
        endDate,
        "MMM d, yyyy"
      )}`;
    }
    return "Select Date Range";
  };

  return (
    <div className="date-range-picker" ref={containerRef}>
      <button className="date-range-trigger" onClick={() => setIsOpen(!isOpen)}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M12.6667 2.66667H3.33333C2.59695 2.66667 2 3.26362 2 4V13.3333C2 14.0697 2.59695 14.6667 3.33333 14.6667H12.6667C13.403 14.6667 14 14.0697 14 13.3333V4C14 3.26362 13.403 2.66667 12.6667 2.66667Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10.6667 1.33333V4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5.33333 1.33333V4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M2 6.66667H14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>{getDisplayText()}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
          }}
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="date-range-dropdown">
          <div className="quick-ranges">
            {QUICK_RANGES.map((range) => (
              <button
                key={range.label}
                className="quick-range-button"
                onClick={() => handleQuickRange(range)}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

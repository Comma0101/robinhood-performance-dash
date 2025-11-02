"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";

interface Command {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  action: () => void;
  category: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
}

export default function CommandPalette({
  isOpen,
  onClose,
  commands,
}: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    if (!search) return commands;

    const searchLower = search.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(searchLower) ||
        cmd.description?.toLowerCase().includes(searchLower) ||
        cmd.category.toLowerCase().includes(searchLower)
    );
  }, [commands, search]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    filteredCommands.forEach((cmd) => {
      if (!groups[cmd.category]) {
        groups[cmd.category] = [];
      }
      groups[cmd.category].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredCommands.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          handleClose();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex]);

  const handleClose = useCallback(() => {
    setSearch("");
    setSelectedIndex(0);
    onClose();
  }, [onClose]);

  const handleCommandClick = useCallback(
    (command: Command) => {
      command.action();
      handleClose();
    },
    [handleClose]
  );

  if (!isOpen) return null;

  return (
    <div className="command-palette-overlay" onClick={handleClose}>
      <div
        className="command-palette"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command Palette"
      >
        <div className="command-palette-search">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="command-search-icon"
          >
            <path
              d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16zM19 19l-4.35-4.35"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <input
            type="text"
            placeholder="Type a command or search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="command-search-input"
            autoFocus
            aria-label="Search commands"
          />
          <kbd className="command-palette-kbd">ESC</kbd>
        </div>

        <div className="command-palette-results">
          {filteredCommands.length === 0 ? (
            <div className="command-empty">
              <p>No commands found</p>
              <span>Try a different search term</span>
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, cmds]) => (
              <div key={category} className="command-group">
                <div className="command-group-label">{category}</div>
                {cmds.map((command, index) => {
                  const globalIndex = filteredCommands.indexOf(command);
                  return (
                    <button
                      key={command.id}
                      className={`command-item ${
                        globalIndex === selectedIndex ? "selected" : ""
                      }`}
                      onClick={() => handleCommandClick(command)}
                      onMouseEnter={() => setSelectedIndex(globalIndex)}
                    >
                      <div className="command-item-content">
                        <div className="command-item-label">
                          {command.label}
                        </div>
                        {command.description && (
                          <div className="command-item-description">
                            {command.description}
                          </div>
                        )}
                      </div>
                      {command.shortcut && (
                        <kbd className="command-item-shortcut">
                          {command.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="command-palette-footer">
          <div className="command-palette-hint">
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            <span>to navigate</span>
          </div>
          <div className="command-palette-hint">
            <kbd>↵</kbd>
            <span>to select</span>
          </div>
          <div className="command-palette-hint">
            <kbd>ESC</kbd>
            <span>to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}

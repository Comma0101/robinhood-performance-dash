import React from "react";

export type IctToggleKey =
  | "eq"
  | "orderBlocks"
  | "fvg"
  | "structure"
  | "sessions";

export interface IctTogglesState extends Record<IctToggleKey, boolean> {}

interface IctTogglesProps {
  toggles: IctTogglesState;
  onToggle: (key: IctToggleKey, value: boolean) => void;
}

const toggleMeta: Record<IctToggleKey, { label: string; description: string }> =
  {
    eq: {
      label: "Dealing Range",
      description: "Show equilibrium and range extremes.",
    },
    orderBlocks: {
      label: "Order Blocks",
      description: "Highlight BOS/ChoCH order blocks.",
    },
    fvg: { label: "FVG", description: "Outline open fair value gaps." },
    structure: { label: "Structure", description: "Mark BOS / ChoCH events." },
    sessions: {
      label: "Sessions",
      description: "Flag kill zone session markers.",
    },
  };

const IctToggles: React.FC<IctTogglesProps> = ({ toggles, onToggle }) => {
  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(toggleMeta).map(([key, meta]) => {
        const typedKey = key as IctToggleKey;
        const active = toggles[typedKey];
        return (
          <button
            key={typedKey}
            type="button"
            onClick={() => onToggle(typedKey, !active)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              active
                ? "border-primary bg-primary/15 text-primary-text shadow-lg ring-2 ring-primary/50"
                : "border-border text-text-secondary hover:border-primary/60 hover:text-text-primary"
            }`}
            title={meta.description}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
};

export default IctToggles;

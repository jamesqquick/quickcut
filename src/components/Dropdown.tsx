import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

type DropdownSize = "sm" | "md";

interface DropdownProps<T extends string = string> {
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  size?: DropdownSize;
  placeholder?: string;
  className?: string;
  menuAlign?: "left" | "right";
  menuWidth?: string;
  id?: string;
}

const sizeClasses: Record<DropdownSize, { trigger: string; option: string }> = {
  sm: {
    trigger: "px-3 py-1.5 text-xs",
    option: "px-3 py-1.5 text-xs",
  },
  md: {
    trigger: "px-4 py-2 text-sm",
    option: "px-3 py-2 text-sm",
  },
};

export function Dropdown<T extends string = string>({
  options,
  value,
  onChange,
  disabled = false,
  size = "md",
  placeholder = "Select...",
  className = "",
  menuAlign = "right",
  menuWidth = "w-48",
  id,
}: DropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((opt) => opt.value === value);
  const enabledOptions = options.filter((opt) => !opt.disabled);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Scroll focused option into view
  useEffect(() => {
    if (!open || focusedIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[role="option"]');
    items[focusedIndex]?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex, open]);

  const handleSelect = useCallback(
    (optionValue: T) => {
      if (optionValue === value) {
        setOpen(false);
        return;
      }
      onChange(optionValue);
      setOpen(false);
    },
    [onChange, value],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      switch (e.key) {
        case "Enter":
        case " ": {
          e.preventDefault();
          if (!open) {
            setOpen(true);
            setFocusedIndex(enabledOptions.findIndex((opt) => opt.value === value));
          } else if (focusedIndex >= 0 && focusedIndex < enabledOptions.length) {
            handleSelect(enabledOptions[focusedIndex].value);
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          setOpen(false);
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          if (!open) {
            setOpen(true);
            setFocusedIndex(enabledOptions.findIndex((opt) => opt.value === value));
          } else {
            setFocusedIndex((prev) => Math.min(prev + 1, enabledOptions.length - 1));
          }
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          if (open) {
            setFocusedIndex((prev) => Math.max(prev - 1, 0));
          }
          break;
        }
      }
    },
    [disabled, enabledOptions, focusedIndex, handleSelect, open, value],
  );

  const toggle = () => {
    if (disabled) return;
    setOpen((prev) => {
      if (!prev) {
        setFocusedIndex(enabledOptions.findIndex((opt) => opt.value === value));
      }
      return !prev;
    });
  };

  const styles = sizeClasses[size];

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        id={id}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex w-full items-center justify-between gap-2 rounded-lg border border-border-default bg-bg-secondary font-medium text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary disabled:opacity-50 ${styles.trigger}`}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <svg
          className="h-3.5 w-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          aria-activedescendant={
            focusedIndex >= 0 ? `dropdown-option-${enabledOptions[focusedIndex]?.value}` : undefined
          }
          className={`absolute ${menuAlign === "right" ? "right-0" : "left-0"} z-30 mt-1 ${menuWidth} overflow-auto rounded-lg border border-border-default bg-bg-secondary py-1 shadow-lg`}
        >
          {options.map((option) => {
            const isCurrent = option.value === value;
            const enabledIdx = enabledOptions.indexOf(option);
            const isFocused = enabledIdx === focusedIndex;

            return (
              <li
                key={option.value}
                id={`dropdown-option-${option.value}`}
                role="option"
                aria-selected={isCurrent}
                aria-disabled={option.disabled}
                onClick={() => {
                  if (!option.disabled) handleSelect(option.value);
                }}
                onMouseEnter={() => {
                  if (!option.disabled && enabledIdx >= 0) setFocusedIndex(enabledIdx);
                }}
                className={`flex w-full cursor-pointer items-center gap-2 transition-colors ${styles.option} ${
                  isCurrent
                    ? "font-medium text-accent-primary"
                    : option.disabled
                      ? "cursor-not-allowed text-text-tertiary opacity-50"
                      : isFocused
                        ? "bg-bg-tertiary text-text-primary"
                        : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                }`}
              >
                {option.icon}
                <span className="flex-1 truncate">{option.label}</span>
                {option.iconRight}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

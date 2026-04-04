"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type SelectFieldUIProps = {
  className?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: string[];
};

export function SelectFieldUI({
  className,
  defaultValue,
  onChange,
  options,
}: SelectFieldUIProps) {
  const initialValue = defaultValue ?? options[0] ?? "";
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState(initialValue);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelected(initialValue);
  }, [initialValue]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-[1.45rem] bg-white/5 px-4 py-3 text-left text-white transition",
          "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] hover:bg-white/[0.07] focus:outline-none",
          isOpen ? "bg-white/[0.07]" : "",
        )}
      >
        <span className="truncate">{selected}</span>
        <span className={cn("shrink-0 text-white/35 transition", isOpen ? "rotate-180" : "")}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M3 5.25L7 9.25L11 5.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-50 overflow-hidden rounded-[1.45rem] bg-[#16202a] p-2 shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="terminal-scroll max-h-64 space-y-1 overflow-y-auto">
            {options.map((option) => {
              const isSelected = option === selected;

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setSelected(option);
                    setIsOpen(false);
                    onChange?.(option);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-[1rem] px-4 py-3 text-left text-sm transition",
                    isSelected
                      ? "bg-accent/12 text-accent"
                      : "text-white/75 hover:bg-white/[0.05] hover:text-white",
                  )}
                >
                  <span>{option}</span>
                  {isSelected ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

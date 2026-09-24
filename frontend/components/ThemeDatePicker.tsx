"use client";

import React, { useState, useEffect, useRef } from "react";

interface ThemeDatePickerProps {
  value: string; // format: "YYYY-MM-DD" e.g. "2026-05-02"
  onChange: (val: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  align?: "left" | "center" | "right";
  className?: string;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const WEEKDAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function ThemeDatePicker({
  value,
  onChange,
  label,
  placeholder = "Select date",
  disabled = false,
  align,
  className = "",
}: ThemeDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial year and month
  const parseDate = (valStr: string) => {
    if (!valStr) return new Date();
    const parts = valStr.split("-");
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      return new Date(y, m, d);
    }
    return new Date();
  };

  const initialDate = parseDate(value);
  const [viewYear, setViewYear] = useState<number>(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(initialDate.getMonth());

  // Update view month/year when value changes externally
  useEffect(() => {
    if (value) {
      const d = parseDate(value);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  // Handle click outside to close popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Format display date: "02 May 2026"
  const formatDisplay = (valStr: string) => {
    if (!valStr) return "";
    const parts = valStr.split("-");
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dateObj = new Date(y, m, d);
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      }
    }
    return valStr;
  };

  // Month navigation
  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const mm = String(viewMonth + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const isoString = `${viewYear}-${mm}-${dd}`;
    onChange(isoString);
    setIsOpen(false);
  };

  const handleSelectToday = () => {
    const today = new Date();
    const y = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const isoString = `${y}-${mm}-${dd}`;
    setViewYear(y);
    setViewMonth(today.getMonth());
    onChange(isoString);
    setIsOpen(false);
  };

  // Calculate calendar grid
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 (Sun) to 6 (Sat)
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  // Trailing days from previous month
  const prevMonthDays = [];
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    prevMonthDays.push(daysInPrevMonth - i);
  }

  // Current month days
  const currentMonthDays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    currentMonthDays.push(d);
  }

  // Leading days of next month to complete the row
  const totalRendered = prevMonthDays.length + currentMonthDays.length;
  const trailingRemaining = (7 - (totalRendered % 7)) % 7;
  const nextMonthDays = [];
  for (let d = 1; d <= trailingRemaining; d++) {
    nextMonthDays.push(d);
  }

  // Selected date components
  const selectedDateObj = parseDate(value);
  const isSelectedDate = (day: number) => {
    if (!value) return false;
    return (
      selectedDateObj.getFullYear() === viewYear &&
      selectedDateObj.getMonth() === viewMonth &&
      selectedDateObj.getDate() === day
    );
  };

  // Today indicator
  const today = new Date();
  const isToday = (day: number) => {
    return (
      today.getFullYear() === viewYear &&
      today.getMonth() === viewMonth &&
      today.getDate() === day
    );
  };

  // Year options for quick select (current year - 5 to + 5)
  const currentYearNow = new Date().getFullYear();
  const yearOptions = Array.from({ length: 12 }, (_, i) => currentYearNow - 3 + i);

  return (
    <div ref={containerRef} className={`relative ${isOpen ? "z-50" : "z-10"} ${className}`}>
      {label && (
        <label className="text-xs font-semibold text-slate-700 block mb-1">
          {label}
        </label>
      )}

      {/* Trigger Button / Input Display */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2.5 px-3.5 py-2 text-xs sm:text-sm rounded-xl border bg-white transition-all cursor-pointer select-none text-left ${
          isOpen
            ? "border-indigo-500 ring-2 ring-indigo-500/20 shadow-xs"
            : "border-slate-200 hover:border-slate-300 shadow-2xs"
        } ${disabled ? "opacity-50 cursor-not-allowed bg-slate-50" : ""}`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Theme-matching Calendar SVG Icon */}
          <div className="w-6 h-6 rounded-lg bg-[#0c1033] flex items-center justify-center text-white flex-shrink-0 shadow-2xs">
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>

          <span
            className={`whitespace-nowrap font-semibold text-xs sm:text-sm ${
              value ? "text-slate-900 font-bold" : "text-slate-400 font-normal"
            }`}
          >
            {value ? formatDisplay(value) : placeholder}
          </span>
        </div>

        {/* Dropdown Chevron Indicator */}
        <div className="flex items-center flex-shrink-0 text-slate-400 pl-1">
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${
              isOpen ? "rotate-180 text-indigo-600" : "text-slate-400"
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* Popover Calendar Modal / Dropdown */}
      {isOpen && (
        <div
          className={`absolute top-full mt-2 z-[100] w-72 bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden animate-in fade-in zoom-in-95 duration-150 ring-1 ring-slate-900/10 ${
            align === "center"
              ? "left-1/2 -translate-x-1/2"
              : align === "right"
              ? "right-0"
              : "left-0"
          }`}
        >
          {/* Header with Dark Navy Brand Gradient */}
          <div className="bg-gradient-to-r from-[#0c1033] via-[#151b54] to-[#1a2063] px-4 py-3.5 text-white flex items-center justify-between border-b border-indigo-950/40">
            {/* Month & Year Title with Selectors */}
            <div className="flex items-center gap-1.5">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
                className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-2 py-1 rounded-lg border border-white/15 focus:outline-none cursor-pointer"
              >
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={index} className="text-slate-900 bg-white">
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={viewYear}
                onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
                className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-2 py-1 rounded-lg border border-white/15 focus:outline-none cursor-pointer"
              >
                {yearOptions.map((yr) => (
                  <option key={yr} value={yr} className="text-slate-900 bg-white">
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            {/* Navigation Arrows */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={prevMonth}
                title="Previous month"
                className="w-7 h-7 rounded-lg text-slate-300 hover:text-white hover:bg-white/15 flex items-center justify-center transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={nextMonth}
                title="Next month"
                className="w-7 h-7 rounded-lg text-slate-300 hover:text-white hover:bg-white/15 flex items-center justify-center transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>

          {/* Weekday Row */}
          <div className="grid grid-cols-7 bg-slate-50/90 border-b border-slate-100 px-2 py-1.5 text-center">
            {WEEKDAY_NAMES.map((day) => (
              <span
                key={day}
                className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider"
              >
                {day}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="p-2.5 grid grid-cols-7 gap-1 bg-white">
            {/* Previous month trailing days */}
            {prevMonthDays.map((day, idx) => (
              <div
                key={`prev-${idx}`}
                className="h-8 flex items-center justify-center text-xs font-normal text-slate-300 select-none pointer-events-none"
              >
                {day}
              </div>
            ))}

            {/* Current month days */}
            {currentMonthDays.map((day) => {
              const selected = isSelectedDate(day);
              const todayCurrent = isToday(day);

              return (
                <button
                  key={`cur-${day}`}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`h-8 rounded-xl text-xs font-medium transition-all flex items-center justify-center cursor-pointer select-none ${
                    selected
                      ? "bg-[#22c55e] text-white font-bold shadow-md shadow-emerald-500/25 scale-105"
                      : todayCurrent
                      ? "border border-indigo-300 text-indigo-700 bg-indigo-50/50 font-semibold hover:bg-indigo-100"
                      : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 active:scale-95"
                  }`}
                >
                  {day}
                </button>
              );
            })}

            {/* Next month leading days */}
            {nextMonthDays.map((day, idx) => (
              <div
                key={`next-${idx}`}
                className="h-8 flex items-center justify-center text-xs font-normal text-slate-300 select-none pointer-events-none"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Fully Visible Clean Footer Bar */}
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border-t border-slate-100 text-xs">
            <button
              type="button"
              onClick={handleSelectToday}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
              <span>Today</span>
            </button>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-medium">
                {value ? formatDisplay(value) : "None"}
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer shadow-2xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

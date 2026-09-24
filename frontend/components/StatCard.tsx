import React from "react";

export interface StatCardProps {
  label: string;
  count: number | string;
  icon: React.ReactNode;
  iconBgClass: string;
}

export function StatCard({
  label,
  count,
  icon,
  iconBgClass,
}: StatCardProps) {
  return (
    <div className="flex items-center gap-4 sm:gap-5 p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md hover:border-slate-300/80 transition-all duration-300 group">
      {/* Icon Badge */}
      <div
        className={`w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-105 shadow-xs ${iconBgClass}`}
      >
        {icon}
      </div>

      {/* Metric details */}
      <div className="flex flex-col min-w-0">
        <span className="text-xs sm:text-sm font-semibold text-slate-500 truncate">
          {label}
        </span>
        <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
          {count}
        </span>
      </div>
    </div>
  );
}

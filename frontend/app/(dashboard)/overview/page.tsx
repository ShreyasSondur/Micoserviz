"use client";

import React, { useState, useEffect } from "react";
import {
  FolderStatIcon,
  HistoryClockIcon,
  AlertWarningIcon,
  CheckCircleFilledIcon,
} from "@/assets/icons";
import { StatCard } from "@/components/StatCard";
import { ActiveTaskListCard } from "@/components/ActiveTaskListCard";
import { API_BASE_URL } from "@/lib/api";

interface BackendProjectResponse {
  id: number;
  project_key?: string;
  name: string;
  code?: string;
  priority?: string;
  priority_level?: string;
  is_completed?: boolean;
}

export default function OverviewPage() {
  const [stats, setStats] = useState({
    totalProjects: 0,
    inProgress: 0,
    needsAttention: 0,
    completed: 0,
  });

  useEffect(() => {
    let isMounted = true;
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/projects`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as BackendProjectResponse[];
          if (Array.isArray(data) && isMounted) {
            const total = data.length;
            const completed = data.filter((p) => p.is_completed).length;
            const inProgress = total - completed;
            const needsAttention = data.filter(
              (p) =>
                !p.is_completed &&
                (p.priority?.toLowerCase() === "high" || p.priority_level === "high")
            ).length;

            setStats({
              totalProjects: total,
              inProgress,
              needsAttention,
              completed,
            });
          }
        }
      } catch {
        // Keep default dynamic stats
      }
    };

    fetchStats();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Page Title & Subtitle */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Overview
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Track all your projects and operations at a glance
        </p>
      </div>

      {/* Top Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <StatCard
          label="Total projects"
          count={stats.totalProjects}
          icon={<FolderStatIcon className="w-6 h-6 text-[#7c3aed]" />}
          iconBgClass="bg-[#f3e8ff]"
        />
        <StatCard
          label="In Progress"
          count={stats.inProgress}
          icon={<HistoryClockIcon className="w-6 h-6 text-[#0284c7]" />}
          iconBgClass="bg-[#e0f2fe]"
        />
        <StatCard
          label="Needs Attention"
          count={stats.needsAttention}
          icon={<AlertWarningIcon className="w-6 h-6 text-[#ef4444]" />}
          iconBgClass="bg-[#fee2e2]"
        />
        <StatCard
          label="Completed"
          count={stats.completed}
          icon={<CheckCircleFilledIcon className="w-6 h-6 text-[#16a34a]" />}
          iconBgClass="bg-[#dcfce7]"
        />
      </div>

      {/* Main Active Task List Card - Full Width, Clean & Properly Visible */}
      <div className="w-full">
        <ActiveTaskListCard />
      </div>
    </div>
  );
}

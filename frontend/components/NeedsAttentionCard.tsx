"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AlertWarningIcon } from "@/assets/icons";
import { API_BASE_URL } from "@/lib/api";

interface ProjectItem {
  id: string;
  name: string;
  code: string;
  priority: string;
  level: "high" | "medium" | "low";
}

interface BackendProjectResponse {
  id: number;
  project_key?: string;
  name: string;
  code?: string;
  priority?: string;
  priority_level?: string;
  is_completed?: boolean;
}

export function NeedsAttentionCard() {
  const [attentionProjects, setAttentionProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadHighPriorityProjects = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/projects`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as BackendProjectResponse[];
          if (Array.isArray(data) && isMounted) {
            const highPriority = data
              .filter(
                (p) =>
                  !p.is_completed &&
                  (p.priority?.toLowerCase() === "high" || p.priority_level === "high")
              )
              .map((p) => ({
                id: p.project_key || `p${p.id}`,
                name: p.name,
                code: p.code || "-",
                priority: p.priority || "High",
                level: (p.priority_level || "high") as "high" | "medium" | "low",
              }));
            setAttentionProjects(highPriority);
          }
        }
      } catch {
        // Fallback safely to empty state
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadHighPriorityProjects();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="flex flex-col h-full rounded-2xl bg-white border border-slate-200/80 p-5 sm:p-6 shadow-xs hover:shadow-md transition-all duration-300">
      {/* Header */}
      <div className="flex items-center gap-3.5 mb-6">
        <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500 flex-shrink-0 border border-rose-100/80">
          <AlertWarningIcon className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900 tracking-tight">
            Needs Attention
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            High Priority projects that need your attention
          </p>
        </div>
      </div>

      {/* Table Content */}
      <div className="w-full overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 pb-3.5 border-b border-slate-100 text-xs font-semibold text-slate-400 tracking-wider">
          <div className="col-span-8 pl-1">Project</div>
          <div className="col-span-4 text-right pr-1">Priority</div>
        </div>

        {/* Project Rows */}
        <div className="divide-y divide-slate-100">
          {attentionProjects.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              {loading ? "Loading high priority projects..." : "No projects currently require urgent attention."}
            </div>
          ) : (
            attentionProjects.map((project, idx) => (
              <Link
                key={`${project.id}-${idx}`}
                href={`/projects/${project.id}`}
                className="grid grid-cols-12 items-center py-4 px-1 rounded-xl transition-colors hover:bg-slate-50/80 cursor-pointer"
              >
                <div className="col-span-8 pr-2">
                  <div className="text-sm font-semibold text-slate-900 tracking-tight">
                    {project.name}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 font-mono">
                    {project.code}
                  </div>
                </div>

                <div className="col-span-4 flex justify-end pr-1">
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-md text-xs font-semibold border ${
                      project.level === "high"
                        ? "text-red-600 bg-red-50/90 border-red-200/70"
                        : "text-amber-600 bg-amber-50/90 border-amber-200/70"
                    }`}
                  >
                    {project.priority}
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { BackendResourceItem, BackendSiteExecutionLog } from "@/lib/api";

/**
 * Helper to convert an image URL or blob URL into a high-definition base64 Data URL for jsPDF embedding
 */
const getImageDataUrl = async (url: string): Promise<{ dataUrl: string; width: number; height: number } | null> => {
  if (!url) return null;
  
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const natWidth = img.naturalWidth || img.width || 1200;
        const natHeight = img.naturalHeight || img.height || 900;

        // If it's already a high-quality data URL, we can use it directly with its natural dimensions
        if (url.startsWith("data:image")) {
          resolve({ dataUrl: url, width: natWidth, height: natHeight });
          return;
        }

        // Otherwise draw to high-res canvas (max 2400px to maintain crisp print clarity without bloating memory)
        const maxDim = 2400;
        let targetW = natWidth;
        let targetH = natHeight;
        if (targetW > maxDim || targetH > maxDim) {
          if (targetW > targetH) {
            targetH = Math.round((targetH * maxDim) / targetW);
            targetW = maxDim;
          } else {
            targetW = Math.round((targetW * maxDim) / targetH);
            targetH = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.96);
          resolve({ dataUrl, width: natWidth, height: natHeight });
        } else {
          resolve({ dataUrl: url, width: natWidth, height: natHeight });
        }
      } catch (e) {
        console.warn("Could not process image on canvas, falling back to raw url", e);
        resolve({ dataUrl: url, width: img.naturalWidth || 800, height: img.naturalHeight || 600 });
      }
    };
    img.onerror = () => {
      // If CORS or error, still attempt with raw data url if available
      if (url.startsWith("data:image")) {
        resolve({ dataUrl: url, width: 800, height: 600 });
      } else {
        resolve(null);
      }
    };
    img.src = url;
  });
};

/**
 * 1. Export Resource Planning allocation for a specific date to an Excel (.xlsx) file
 */
export const exportResourcesToExcel = (params: {
  projectName: string;
  projectKey: string;
  dateStr: string;
  formattedDateLabel: string;
  items: BackendResourceItem[];
}) => {
  const { projectName, projectKey, dateStr, formattedDateLabel, items } = params;

  const totalMembers = items.length;
  const totalHours = items.reduce((acc, curr) => acc + (Number(curr.hours_worked) || 0), 0);

  // Build sheet data matrix
  const sheetData: (string | number)[][] = [
    ["PROJECT RESOURCE PLANNING & MANPOWER ALLOCATION REPORT"],
    [],
    ["Project Name:", projectName],
    ["Project ID / Code:", projectKey],
    ["Report Date:", formattedDateLabel],
    ["Exported On:", new Date().toLocaleString()],
    [],
    ["SN", "Member Name", "Member Type", "Hours Worked (hrs)", "Allocation Date"],
  ];

  if (items.length === 0) {
    sheetData.push(["-", "No members allocated for this date", "-", "-", dateStr]);
  } else {
    items.forEach((item, idx) => {
      sheetData.push([
        item.sl_no || idx + 1,
        item.name,
        item.type || "Internal",
        item.hours_worked,
        item.date || dateStr,
      ]);
    });
  }

  sheetData.push([]);
  sheetData.push(["SUMMARY", "", "", "", ""]);
  sheetData.push(["Total Allocated Members:", totalMembers, "", "", ""]);
  sheetData.push(["Total Man-Hours Worked:", `${totalHours} hrs`, "", "", ""]);

  // Create workbook and worksheet
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Adjust column widths
  ws["!cols"] = [
    { wch: 8 },  // SN
    { wch: 32 }, // Member Name
    { wch: 18 }, // Type
    { wch: 22 }, // Hours Worked
    { wch: 18 }, // Date
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resource Allocation");

  const cleanDateStr = dateStr.replace(/[^a-zA-Z0-9_-]/g, "_");
  const cleanKey = projectKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `Resource_Planning_${cleanKey}_${cleanDateStr}.xlsx`;

  XLSX.writeFile(wb, fileName);
};

/**
 * 2. Export Site Execution logs for a specific date (or full feed) to a structured PDF report
 */
export const exportSiteExecutionToPdf = async (params: {
  projectName: string;
  projectKey: string;
  dateStr?: string;
  formattedDateLabel: string;
  verifiedMilestone: number;
  logs: BackendSiteExecutionLog[];
}) => {
  const { projectName, projectKey, dateStr, formattedDateLabel, verifiedMilestone, logs } = params;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin - 10) {
      doc.addPage();
      y = margin;
      drawHeaderBanner(false);
    }
  };

  const drawHeaderBanner = (isFirstPage: boolean) => {
    // Top Brand Bar
    doc.setFillColor(12, 16, 51); // Dark Navy #0c1033
    doc.rect(margin, y, contentWidth, isFirstPage ? 24 : 12, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    if (isFirstPage) {
      doc.setFontSize(13);
      doc.text("SITE EXECUTION & DAILY PROGRESS REPORT", margin + 6, y + 9);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Project: ${projectName} (${projectKey})  |  Date: ${formattedDateLabel}`, margin + 6, y + 17);
      y += 28;
    } else {
      doc.setFontSize(9);
      doc.text(`Site Execution Report - ${projectName} (${projectKey}) | ${formattedDateLabel}`, margin + 4, y + 8);
      y += 16;
    }
  };

  // Draw Page 1 Header
  drawHeaderBanner(true);

  // Executive Overview Card on first page
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 22, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text("PROJECT OVERVIEW", margin + 4, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Project Code: ${projectKey}`, margin + 4, y + 12);
  doc.text(`Report Period / Date: ${formattedDateLabel}`, margin + 4, y + 17);

  doc.text(`Verified Milestone: ${verifiedMilestone}%`, margin + 80, y + 12);
  doc.text(`Total Daily Logs: ${logs.length} entries`, margin + 80, y + 17);

  doc.text(`Exported: ${new Date().toLocaleString()}`, margin + 130, y + 12);
  doc.text(`Status: Official Verified Report`, margin + 130, y + 17);

  y += 28;

  if (logs.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text(`No site execution logs recorded for ${formattedDateLabel}.`, margin, y + 10);
  } else {
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const role = log.creator_role || "Site Supervisor";

      // If not the first log, start every subsequent log on a fresh new page
      if (i > 0) {
        doc.addPage();
        y = margin;
        drawHeaderBanner(false);
      }

      // Extract attached images
      const images: Array<{ url: string; name?: string }> = Array.isArray(log.images)
        ? log.images.filter((img) => img && img.url)
        : [];

      // Section Entry Header Box
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(margin, y, contentWidth, 8, 1.5, 1.5, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      const title = log.phase_name || `Site Execution Inspection #${log.id}`;
      doc.text(`Log #${i + 1}: ${title}`, margin + 3, y + 5.5);

      // Role & Time on right
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      const logTime = log.created_at ? new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      doc.text(`Logged by: ${log.supervisor_name} [${role}] ${logTime ? `at ${logTime}` : ""}`, margin + contentWidth - 3, y + 5.5, { align: "right" });

      y += 12;

      // Description / Observation text
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text("Daily Observation & Progress Notes:", margin + 2, y);
      y += 4.5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      const descriptionLines = doc.splitTextToSize(log.description || "No description provided.", contentWidth - 4);
      
      checkPageBreak(descriptionLines.length * 4 + 10);
      doc.text(descriptionLines, margin + 2, y);
      y += descriptionLines.length * 4.5 + 4;

      // Attached Photos Gallery in PDF
      if (images.length > 0) {
        checkPageBreak(15);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text("Attached Proof:", margin + 2, y);
        y += 5;

        // Use 1-column featured layout if single image, or 2-column spacious layout for multiple images
        const isSingle = images.length === 1;
        const imgCols = isSingle ? 1 : 2;
        const imgGap = 5;
        const cardWidth = (contentWidth - imgGap * (imgCols - 1)) / imgCols;
        const cardHeight = isSingle ? 85 : 66; // mm

        for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
          const col = imgIdx % imgCols;
          if (col === 0 && imgIdx > 0) {
            y += cardHeight + 5;
          }

          checkPageBreak(cardHeight + 8);

          const imgObj = images[imgIdx];
          const posX = margin + col * (cardWidth + imgGap);

          // Card Background & Frame
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.roundedRect(posX, y, cardWidth, cardHeight, 2, 2, "FD");

          try {
            const loaded = await getImageDataUrl(imgObj.url);
            if (loaded && loaded.dataUrl) {
              const maxImgW = cardWidth - 4;
              const maxImgH = cardHeight - 9; // leave space for caption
              const imgAspect = (loaded.width && loaded.height) ? (loaded.height / loaded.width) : 0.75;
              
              let renderW = maxImgW;
              let renderH = renderW * imgAspect;
              if (renderH > maxImgH) {
                renderH = maxImgH;
                renderW = renderH / imgAspect;
              }

              const offX = posX + (cardWidth - renderW) / 2;
              const offY = y + 2 + (maxImgH - renderH) / 2;

              doc.addImage(loaded.dataUrl, "JPEG", offX, offY, renderW, renderH, undefined, "SLOW");
            } else {
              doc.setFontSize(7.5);
              doc.setTextColor(148, 163, 184);
              doc.text("Photo Attached (Preview Unavailable)", posX + cardWidth / 2, y + cardHeight / 2 - 2, { align: "center" });
            }
          } catch (err) {
            console.warn("Could not embed image into PDF", err);
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text("Photo Attached", posX + cardWidth / 2, y + cardHeight / 2 - 2, { align: "center" });
          }

          // Photo Caption Bar at Bottom of Card
          const photoName = imgObj.name || `Photo #${imgIdx + 1}`;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.setTextColor(100, 116, 139);
          const truncatedCaption = photoName.length > 40 ? photoName.slice(0, 37) + "..." : photoName;
          doc.text(`Photo ${imgIdx + 1}: ${truncatedCaption}`, posX + cardWidth / 2, y + cardHeight - 2.5, { align: "center" });
        }

        y += cardHeight + 8;
      }
    }
  }

  // Footer Page Numbering across all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Project: ${projectName} (${projectKey})  |  Report Date: ${formattedDateLabel}  |  Confidential & Proprietary`,
      margin,
      pageHeight - 6
    );
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  }

  const cleanDateStr = (dateStr || "All_Dates").replace(/[^a-zA-Z0-9_-]/g, "_");
  const cleanKey = projectKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  const fileName = `Site_Execution_Report_${cleanKey}_${cleanDateStr}.pdf`;

  doc.save(fileName);
};

export interface ProjectDossierParams {
  projectInfo: {
    name: string;
    client: string;
    location: string;
    code: string;
    priority: string;
    priorityLevel: string;
    budget: string;
    startDate: string;
    manager: string;
    supervisor?: string;
    currentStage: number;
    totalStages: number;
    verifiedProgressPercentage: number;
  };
  sectionStatuses: {
    commercial: string;
    engineering: string;
    budget: string;
    procurement: string;
    soa: string;
    resource: string;
    site_execution: string;
    handover: string;
  };
  activityLogs: Array<{
    user: string;
    module: string;
    action: string;
    time: string;
  }>;
  commercialStages: Array<{
    stageNumber: number;
    status: string;
    poNumber: string;
    poDate: string;
    contractValue: string;
    documents?: Array<{ name: string; size?: string; date?: string }>;
  }>;
  engineeringStages?: Array<{
    stageNumber: number;
    status: string;
    documents?: Array<{ name: string; size?: string; date?: string }>;
  }>;
  costingResources: BackendResourceItem[];
  procurementItems: Array<{
    sl?: number;
    part?: string;
    product?: string;
    vendor?: string;
    brand?: string;
    qty?: number;
    allocated_qty?: number;
    status?: string;
    invoiceNumber?: string;
  }>;
  soaSummary?: {
    totalContract: number;
    received: number;
    balance: number;
    stageBreakdowns?: Array<{
      stageNumber: number;
      contract: number;
      received: number;
      balance: number;
      poNumber?: string;
    }>;
  };
  siteExecutionLogs: BackendSiteExecutionLog[];
}

/**
 * 3. Master Project Dossier & Audit Report PDF Generator
 * Downloads complete project history, audit timeline, all 7 sections,
 * and high-resolution site execution photos embedded permanently.
 */
export const exportProjectDossierToPdf = async (params: ProjectDossierParams) => {
  const {
    projectInfo,
    sectionStatuses,
    activityLogs,
    commercialStages,
    engineeringStages = [],
    costingResources,
    procurementItems,
    soaSummary,
    siteExecutionLogs,
  } = params;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;
  let currentSectionHeader = "Executive Summary";

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin - 12) {
      doc.addPage();
      y = margin;
      drawHeaderBanner(false);
    }
  };

  const drawHeaderBanner = (isFirstPage: boolean) => {
    doc.setFillColor(12, 16, 51); // Dark Navy #0c1033
    doc.rect(margin, y, contentWidth, isFirstPage ? 24 : 12, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    if (isFirstPage) {
      doc.setFontSize(13);
      doc.text("PROJECT DOSSIER & COMPREHENSIVE AUDIT REPORT", margin + 6, y + 9);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.text(
        `Project: ${projectInfo.name} (#${projectInfo.code})  |  Generated: ${new Date().toLocaleString()}`,
        margin + 6,
        y + 17
      );
      y += 28;
    } else {
      doc.setFontSize(8.5);
      doc.text(
        `Project Dossier - ${projectInfo.name} (#${projectInfo.code}) | ${currentSectionHeader}`,
        margin + 4,
        y + 8
      );
      y += 16;
    }
  };

  // Helper to draw section headings
  const drawSectionHeading = (title: string, subtitle?: string) => {
    currentSectionHeader = title;
    checkPageBreak(subtitle ? 18 : 14);
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, y, contentWidth, 9, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(title, margin + 4, y + 6);
    y += 12;

    if (subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(subtitle, margin + 2, y);
      y += 5.5;
    }
  };

  // -------------------------------------------------------------------------
  // PAGE 1: COVER & EXECUTIVE OVERVIEW
  // -------------------------------------------------------------------------
  drawHeaderBanner(true);

  // Project Overview Card
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 34, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text("PROJECT OVERVIEW & METADATA", margin + 4, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);

  // Column 1
  doc.text(`Project Name: ${projectInfo.name}`, margin + 4, y + 13);
  doc.text(`Project Code: #${projectInfo.code}`, margin + 4, y + 19);
  doc.text(`Client: ${projectInfo.client || "Not Specified"}`, margin + 4, y + 25);
  doc.text(`Location: ${projectInfo.location || "United Arab Emirates"}`, margin + 4, y + 31);

  // Column 2
  doc.text(`Project Manager: ${projectInfo.manager || "Admin"}`, margin + 70, y + 13);
  doc.text(`Site Supervisor: ${projectInfo.supervisor || "Site Supervisor"}`, margin + 70, y + 19);
  doc.text(`Start Date: ${projectInfo.startDate || "N/A"}`, margin + 70, y + 25);
  doc.text(`Current Stage: Stage ${projectInfo.currentStage || 1} of ${projectInfo.totalStages || 7}`, margin + 70, y + 31);

  // Column 3
  doc.text(`Priority: ${projectInfo.priority || "High"}`, margin + 132, y + 13);
  doc.text(`Budget / Contract: ${projectInfo.budget || "AED 0.00"}`, margin + 132, y + 19);
  doc.text(`Milestone Progress: ${projectInfo.verifiedProgressPercentage || 0}%`, margin + 132, y + 25);
  doc.text(`Report Exported: ${new Date().toLocaleDateString()}`, margin + 132, y + 31);

  y += 39;

  // Milestone Progress Card
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text("OVERALL PROJECT MILESTONE COMPLETION", margin + 4, y + 6);

  const pct = Math.min(100, Math.max(0, projectInfo.verifiedProgressPercentage || 0));
  doc.setFontSize(8);
  doc.setTextColor(16, 185, 129);
  doc.text(`${pct}% Verified Completion`, margin + contentWidth - 36, y + 6);

  // Progress Bar
  const barX = margin + 4;
  const barY = y + 9.5;
  const barW = contentWidth - 8;
  const barH = 4.5;
  doc.setFillColor(226, 232, 240);
  doc.roundedRect(barX, barY, barW, barH, 1.5, 1.5, "F");
  if (pct > 0) {
    doc.setFillColor(16, 185, 129);
    doc.roundedRect(barX, barY, (barW * pct) / 100, barH, 1.5, 1.5, "F");
  }

  y += 24;

  // Section Workflow Status Grid
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text("SECTION WORKFLOW STATUS MATRIX", margin + 2, y);
  y += 4;

  const sectionsList = [
    { name: "1. Commercial Approval", status: sectionStatuses.commercial || "not_started" },
    { name: "2. Engineering Docs", status: sectionStatuses.engineering || "not_started" },
    { name: "3. Budget & Costing", status: sectionStatuses.budget || "not_started" },
    { name: "4. Procurement", status: sectionStatuses.procurement || "not_started" },
    { name: "5. Statement of Accounts", status: sectionStatuses.soa || "not_started" },
    { name: "6. Site Execution", status: sectionStatuses.site_execution || "not_started" },
    { name: "7. Handover", status: sectionStatuses.handover || "not_started" },
  ];

  const colWidth = (contentWidth - 6) / 2;
  const cardH = 8.5;
  for (let i = 0; i < sectionsList.length; i++) {
    const sec = sectionsList[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const posX = margin + col * (colWidth + 6);
    const posY = y + row * (cardH + 2.5);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(posX, posY, colWidth, cardH, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.text(sec.name, posX + 3, posY + 5.5);

    const isCompleted = sec.status === "completed";
    const isInProgress = sec.status === "in_progress";
    const statusLabel = isCompleted ? "Completed" : isInProgress ? "In Progress" : "Not Started";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    if (isCompleted) {
      doc.setTextColor(16, 185, 129);
    } else if (isInProgress) {
      doc.setTextColor(217, 119, 6);
    } else {
      doc.setTextColor(148, 163, 184);
    }
    doc.text(statusLabel, posX + colWidth - 3, posY + 5.5, { align: "right" });
  }

  y += Math.ceil(sectionsList.length / 2) * (cardH + 2.5) + 6;

  // -------------------------------------------------------------------------
  // SECTION: PROJECT ACTIVITY TIMELINE & AUDIT TRAIL
  // -------------------------------------------------------------------------
  drawSectionHeading(
    "PROJECT ACTIVITY TIMELINE & AUDIT HISTORY",
    "Chronological audit trail of all project events, additions, revisions, and status changes recorded for this project."
  );

  if (activityLogs.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text("No activity logs recorded for this project yet.", margin + 2, y + 4);
    y += 10;
  } else {
    // Activity Table Header
    checkPageBreak(12);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text("Date & Time", margin + 3, y + 5);
    doc.text("User", margin + 42, y + 5);
    doc.text("Module", margin + 74, y + 5);
    doc.text("Action Description", margin + 110, y + 5);
    y += 8;

    for (let i = 0; i < activityLogs.length; i++) {
      const log = activityLogs[i];
      const actionLines = doc.splitTextToSize(log.action || "-", contentWidth - 112);
      const rowHeight = Math.max(6.5, actionLines.length * 3.8 + 2.5);

      checkPageBreak(rowHeight);

      // Zebra striping
      if (i % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 1, contentWidth, rowHeight, "F");
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.2);
      doc.setTextColor(71, 85, 105);
      doc.text(log.time || "-", margin + 3, y + 3.2);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(log.user || "Admin", margin + 42, y + 3.2);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(79, 70, 229);
      doc.text(log.module || "-", margin + 74, y + 3.2);

      doc.setTextColor(30, 41, 59);
      doc.text(actionLines, margin + 110, y + 3.2);

      y += rowHeight;
    }
    y += 6;
  }

  // -------------------------------------------------------------------------
  // SECTION 1: COMMERCIAL APPROVAL & CONTRACTS
  // -------------------------------------------------------------------------
  drawSectionHeading("1. COMMERCIAL APPROVAL & CONTRACT STAGES");

  if (commercialStages.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text("No commercial stages created for this project.", margin + 2, y + 4);
    y += 10;
  } else {
    checkPageBreak(12);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text("Stage", margin + 3, y + 5);
    doc.text("PO Number", margin + 25, y + 5);
    doc.text("PO Date", margin + 65, y + 5);
    doc.text("Contract Value", margin + 105, y + 5);
    doc.text("Status", margin + 145, y + 5);
    y += 8;

    commercialStages.forEach((stage, idx) => {
      checkPageBreak(7.5);
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 1, contentWidth, 6.5, "F");
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Stage ${stage.stageNumber}`, margin + 3, y + 3.5);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      doc.text(stage.poNumber || "—", margin + 25, y + 3.5);
      doc.text(stage.poDate || "—", margin + 65, y + 3.5);
      doc.text(stage.contractValue || "AED 0.00", margin + 105, y + 3.5);

      const isCompleted = stage.status === "completed";
      doc.setFont("helvetica", "bold");
      doc.setTextColor(isCompleted ? 16 : 217, isCompleted ? 185 : 119, isCompleted ? 129 : 6);
      doc.text(isCompleted ? "Completed" : "In Progress", margin + 145, y + 3.5);

      y += 6.5;

      if (stage.documents && stage.documents.length > 0) {
        stage.documents.forEach((docItem) => {
          checkPageBreak(5.5);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.8);
          doc.setTextColor(100, 116, 139);
          const docDate = docItem.date ? ` [${docItem.date}]` : "";
          const docSize = docItem.size ? ` (${docItem.size})` : "";
          doc.text(`   ↳ Document: ${docItem.name}${docSize}${docDate}`, margin + 10, y + 3.2);
          y += 5.2;
        });
      }
    });
    y += 6;
  }

  // -------------------------------------------------------------------------
  // SECTION 2: ENGINEERING DRAWINGS & TECHNICAL SPECIFICATIONS
  // -------------------------------------------------------------------------
  drawSectionHeading(
    "2. ENGINEERING DOCUMENTATION & DRAWINGS",
    "Technical submissions, architectural drawings, and engineering milestone documentation."
  );

  const engStages = engineeringStages || [];
  if (engStages.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text("No engineering stages recorded for this project.", margin + 2, y + 4);
    y += 10;
  } else {
    checkPageBreak(12);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text("Stage", margin + 3, y + 5);
    doc.text("Technical Stage Name", margin + 25, y + 5);
    doc.text("Attached Documents / Drawings", margin + 95, y + 5);
    doc.text("Status", margin + 155, y + 5);
    y += 8;

    engStages.forEach((stage, idx) => {
      checkPageBreak(7.5);
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 1, contentWidth, 6.5, "F");
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Stage ${stage.stageNumber}`, margin + 3, y + 3.5);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      doc.text(`Engineering Stage ${stage.stageNumber}`, margin + 25, y + 3.5);

      const docsCount = stage.documents?.length || 0;
      doc.text(`${docsCount} file${docsCount === 1 ? "" : "s"} submitted`, margin + 95, y + 3.5);

      const isCompleted = stage.status === "completed";
      doc.setFont("helvetica", "bold");
      doc.setTextColor(isCompleted ? 16 : 217, isCompleted ? 185 : 119, isCompleted ? 129 : 6);
      doc.text(isCompleted ? "Completed" : "In Progress", margin + 155, y + 3.5);

      y += 6.5;

      if (stage.documents && stage.documents.length > 0) {
        stage.documents.forEach((docItem) => {
          checkPageBreak(5.5);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.8);
          doc.setTextColor(100, 116, 139);
          const docDate = docItem.date ? ` [${docItem.date}]` : "";
          const docSize = docItem.size ? ` (${docItem.size})` : "";
          doc.text(`   ↳ Drawing: ${docItem.name}${docSize}${docDate}`, margin + 10, y + 3.2);
          y += 5.2;
        });
      }
    });
    y += 6;
  }

  // -------------------------------------------------------------------------
  // SECTION 3: BUDGET & RESOURCE ALLOCATION (MANPOWER)
  // -------------------------------------------------------------------------
  drawSectionHeading("3. RESOURCE PLANNING & MANPOWER ALLOCATION");

  if (costingResources.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text("No manpower resources allocated for this project.", margin + 2, y + 4);
    y += 10;
  } else {
    checkPageBreak(12);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text("#", margin + 3, y + 5);
    doc.text("Member Name", margin + 14, y + 5);
    doc.text("Classification", margin + 65, y + 5);
    doc.text("Hours Worked", margin + 110, y + 5);
    doc.text("Allocation Date", margin + 145, y + 5);
    y += 8;

    let totalLaborHours = 0;
    costingResources.forEach((res, idx) => {
      checkPageBreak(7);
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 1, contentWidth, 6.5, "F");
      }

      const hrs = Number(res.hours_worked) || 0;
      totalLaborHours += hrs;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(String(idx + 1), margin + 3, y + 3.5);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(res.name || "-", margin + 14, y + 3.5);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(71, 85, 105);
      doc.text(res.type || "Internal", margin + 65, y + 3.5);
      doc.text(`${hrs} hrs`, margin + 110, y + 3.5);
      doc.text(res.date || "-", margin + 145, y + 3.5);

      y += 6.5;
    });

    // Summary Row
    checkPageBreak(8);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text("TOTAL LOGGED LABOR HOURS", margin + 14, y + 5);
    doc.text(`${totalLaborHours} hrs`, margin + 110, y + 5);
    y += 12;
  }

  // -------------------------------------------------------------------------
  // SECTION 4: PROCUREMENT & MATERIAL ALLOCATION
  // -------------------------------------------------------------------------
  drawSectionHeading("4. PROCUREMENT & MATERIAL ALLOCATION");

  if (procurementItems.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text("No procurement materials allocated to this project.", margin + 2, y + 4);
    y += 10;
  } else {
    checkPageBreak(12);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y, contentWidth, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text("#", margin + 3, y + 5);
    doc.text("Part No", margin + 12, y + 5);
    doc.text("Product Description", margin + 46, y + 5);
    doc.text("Supplier", margin + 100, y + 5);
    doc.text("Req / Alloc", margin + 140, y + 5);
    doc.text("Status", margin + 165, y + 5);
    y += 8;

    procurementItems.forEach((item, idx) => {
      const prodDesc = item.product || item.part || "-";
      const descLines = doc.splitTextToSize(prodDesc, 50);
      const rowHeight = Math.max(6.5, descLines.length * 3.6 + 2.5);

      checkPageBreak(rowHeight);
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 1, contentWidth, rowHeight, "F");
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.2);
      doc.setTextColor(100, 116, 139);
      doc.text(String(item.sl || idx + 1), margin + 3, y + 3.5);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(item.part || "-", margin + 12, y + 3.5);

      doc.setFont("helvetica", "normal");
      doc.setTextColor(51, 65, 85);
      doc.text(descLines, margin + 46, y + 3.5);
      doc.text(item.vendor || "-", margin + 100, y + 3.5);

      const req = item.qty || 0;
      const alloc = item.allocated_qty || 0;
      doc.text(`${req} / ${alloc}`, margin + 140, y + 3.5);

      doc.setFont("helvetica", "bold");
      const isFulfilled = alloc >= req && req > 0;
      doc.setTextColor(isFulfilled ? 16 : 217, isFulfilled ? 185 : 119, isFulfilled ? 129 : 6);
      doc.text(item.status || (isFulfilled ? "Added" : "Yet To Order"), margin + 165, y + 3.5);

      y += rowHeight;
    });
    y += 6;
  }

  // -------------------------------------------------------------------------
  // SECTION 5: STATEMENT OF ACCOUNTS (FINANCIALS)
  // -------------------------------------------------------------------------
  if (soaSummary) {
    drawSectionHeading("5. STATEMENT OF ACCOUNTS (FINANCIAL SUMMARY)");

    checkPageBreak(22);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, y, contentWidth, 18, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("FINANCIAL OVERVIEW (AED)", margin + 4, y + 5.5);

    doc.setFontSize(7.5);
    doc.text(`Total Contract: AED ${(soaSummary.totalContract || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, margin + 4, y + 12.5);
    doc.setTextColor(16, 185, 129);
    doc.text(`Total Received: AED ${(soaSummary.received || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, margin + 68, y + 12.5);
    doc.setTextColor(225, 29, 72);
    doc.text(`Balance Outstanding: AED ${(soaSummary.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, margin + 124, y + 12.5);

    y += 24;
  }

  // -------------------------------------------------------------------------
  // SECTION 6: SITE EXECUTION DAILY INSPECTION LOGS & ATTACHED PHOTOS
  // -------------------------------------------------------------------------
  drawSectionHeading(
    "6. SITE EXECUTION DAILY LOGS & PHOTOGRAPHIC PROOFS",
    "Detailed supervisor field inspections and high-resolution site progress photos."
  );

  if (siteExecutionLogs.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text("No site execution daily logs recorded for this project.", margin + 2, y + 4);
    y += 10;
  } else {
    for (let logIdx = 0; logIdx < siteExecutionLogs.length; logIdx++) {
      const log = siteExecutionLogs[logIdx];
      const role = log.creator_role || "Site Supervisor";
      const images: Array<{ url: string; name?: string }> = Array.isArray(log.images)
        ? log.images.filter((img) => img && img.url)
        : [];

      checkPageBreak(25);

      // Log Header Box
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(margin, y, contentWidth, 8, 1.5, 1.5, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      const title = log.phase_name || `Site Inspection Log #${log.id}`;
      doc.text(`Log #${logIdx + 1}: ${title}  [${log.date || "Date Unspecified"}]`, margin + 3, y + 5.5);

      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      doc.text(`Supervisor: ${log.supervisor_name || "Site Supervisor"} (${role})`, margin + contentWidth - 3, y + 5.5, { align: "right" });

      y += 11;

      // Description
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      const descLines = doc.splitTextToSize(log.description || "No description provided.", contentWidth - 4);
      checkPageBreak(descLines.length * 4 + 6);
      doc.text(descLines, margin + 2, y);
      y += descLines.length * 4.2 + 4;

      // Attached Photos Gallery
      if (images.length > 0) {
        checkPageBreak(12);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text(`Attached Photographic Proof (${images.length} photos):`, margin + 2, y);
        y += 4.5;

        const isSingle = images.length === 1;
        const imgCols = isSingle ? 1 : 2;
        const imgGap = 5;
        const cardWidth = (contentWidth - imgGap * (imgCols - 1)) / imgCols;
        const cardHeight = isSingle ? 80 : 62; // mm

        for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
          const col = imgIdx % imgCols;
          if (col === 0 && imgIdx > 0) {
            y += cardHeight + 5;
          }

          checkPageBreak(cardHeight + 8);

          const imgObj = images[imgIdx];
          const posX = margin + col * (cardWidth + imgGap);

          // Card Background & Frame
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(226, 232, 240);
          doc.roundedRect(posX, y, cardWidth, cardHeight, 2, 2, "FD");

          try {
            const loaded = await getImageDataUrl(imgObj.url);
            if (loaded && loaded.dataUrl) {
              const maxImgW = cardWidth - 4;
              const maxImgH = cardHeight - 8;
              const imgAspect = loaded.width && loaded.height ? loaded.height / loaded.width : 0.75;

              let renderW = maxImgW;
              let renderH = renderW * imgAspect;
              if (renderH > maxImgH) {
                renderH = maxImgH;
                renderW = renderH / imgAspect;
              }

              const offX = posX + (cardWidth - renderW) / 2;
              const offY = y + 2 + (maxImgH - renderH) / 2;

              doc.addImage(loaded.dataUrl, "JPEG", offX, offY, renderW, renderH, undefined, "SLOW");
            } else {
              doc.setFontSize(7);
              doc.setTextColor(148, 163, 184);
              doc.text("Photo Attached (Preview Unavailable)", posX + cardWidth / 2, y + cardHeight / 2 - 2, { align: "center" });
            }
          } catch (err) {
            console.warn("Could not embed image into PDF", err);
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text("Photo Attached", posX + cardWidth / 2, y + cardHeight / 2 - 2, { align: "center" });
          }

          const photoCaption = imgObj.name || `Photo #${imgIdx + 1}`;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.setTextColor(100, 116, 139);
          const truncatedCaption = photoCaption.length > 38 ? photoCaption.slice(0, 35) + "..." : photoCaption;
          doc.text(`Photo ${imgIdx + 1}: ${truncatedCaption}`, posX + cardWidth / 2, y + cardHeight - 2, { align: "center" });
        }

        y += cardHeight + 8;
      }

      y += 4;
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 7: PROJECT HANDOVER & VERIFICATION SIGN-OFF
  // -------------------------------------------------------------------------
  checkPageBreak(40);
  drawSectionHeading("7. PROJECT VERIFICATION & HANDOVER SIGN-OFF");

  const signColWidth = (contentWidth - 8) / 3;
  const signHeight = 22;

  const signBlocks = [
    { title: "Project Manager", name: projectInfo.manager || "Admin" },
    { title: "Site Supervisor", name: projectInfo.supervisor || "Site Supervisor" },
    { title: "Client Representative", name: projectInfo.client || "Client Authorized Rep" },
  ];

  signBlocks.forEach((block, idx) => {
    const posX = margin + idx * (signColWidth + 4);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(posX, y, signColWidth, signHeight, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(block.title, posX + 3, y + 5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(block.name, posX + 3, y + 10);

    doc.setDrawColor(203, 213, 225);
    doc.line(posX + 3, y + 18, posX + signColWidth - 3, y + 18);
  });

  y += signHeight + 8;

  // -------------------------------------------------------------------------
  // FOOTER: PAGE NUMBERS & AUDIT NOTICE ACROSS ALL PAGES
  // -------------------------------------------------------------------------
  const finalTotalPages = doc.getNumberOfPages();
  for (let p = 1; p <= finalTotalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Project Dossier: ${projectInfo.name} (#${projectInfo.code})  |  Exported: ${new Date().toLocaleDateString()}  |  Confidential`,
      margin,
      pageHeight - 6
    );
    doc.text(`Page ${p} of ${finalTotalPages}`, pageWidth - margin, pageHeight - 6, { align: "right" });
  }

  const cleanKey = String(projectInfo.code || "PROJECT").replace(/[^a-zA-Z0-9_-]/g, "_");
  const cleanName = projectInfo.name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
  const fileName = `Project_Dossier_${cleanKey}_${cleanName}.pdf`;

  doc.save(fileName);
};

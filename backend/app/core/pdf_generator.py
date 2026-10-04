import io
import os
import datetime
import json
from typing import Optional, List, Dict, Any
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT


def generate_invoice_pdf_bytes(
    invoice_number: str,
    vendor: str = "Vendor / Supplier",
    invoice_date: str = "",
    total_amount: float = 0.0,
    currency: str = "AED",
    status: str = "Verified",
    description: Optional[str] = None,
) -> bytes:
    """
    Generates a professional, high-resolution corporate PDF Invoice using ReportLab.
    Returns bytes of the generated PDF document.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    header_title_style = ParagraphStyle(
        "HeaderTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0f172a"),  # slate-900
    )

    company_sub_style = ParagraphStyle(
        "CompanySub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#64748b"),  # slate-500
    )

    invoice_badge_style = ParagraphStyle(
        "InvoiceBadge",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        alignment=TA_RIGHT,
        textColor=colors.HexColor("#0284c7"),  # sky-600
    )

    invoice_num_style = ParagraphStyle(
        "InvoiceNum",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        alignment=TA_RIGHT,
        textColor=colors.HexColor("#0f172a"),
    )

    date_style = ParagraphStyle(
        "DateStyle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        alignment=TA_RIGHT,
        textColor=colors.HexColor("#64748b"),
    )

    meta_label = ParagraphStyle(
        "MetaLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#94a3b8"),
        textTransform="uppercase",
    )

    meta_value = ParagraphStyle(
        "MetaValue",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#1e293b"),
    )

    table_header_style = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=colors.white,
    )

    table_header_right = ParagraphStyle(
        "TableHeaderRight",
        parent=table_header_style,
        alignment=TA_RIGHT,
    )

    table_cell_style = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#334155"),
    )

    table_cell_bold = ParagraphStyle(
        "TableCellBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#0f172a"),
    )

    table_cell_right = ParagraphStyle(
        "TableCellRight",
        parent=table_cell_style,
        alignment=TA_RIGHT,
    )

    table_cell_bold_right = ParagraphStyle(
        "TableCellBoldRight",
        parent=table_cell_bold,
        alignment=TA_RIGHT,
    )

    status_tag_style = ParagraphStyle(
        "StatusTag",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#065f46"),
    )

    footer_style = ParagraphStyle(
        "Footer",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#94a3b8"),
    )

    elements = []

    # 1. Header Section
    header_data = [
        [
            Paragraph("MICROSERVICE OPS", header_title_style),
            Paragraph("OFFICIAL INVOICE", invoice_badge_style),
        ],
        [
            Paragraph(
                "Engineering & Enterprise Operations Platform<br/>Commercial Verification & Document Center",
                company_sub_style,
            ),
            Paragraph(
                f"<b>Invoice #:</b> {invoice_number}<br/><b>Date:</b> {invoice_date or 'N/A'}",
                date_style,
            ),
        ],
    ]
    header_table = Table(header_data, colWidths=[3.5 * inch, 4.0 * inch])
    header_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    elements.append(header_table)
    elements.append(Spacer(1, 14))

    # Divider Line
    elements.append(
        HRFlowable(
            width="100%",
            thickness=1.5,
            color=colors.HexColor("#0284c7"),
            spaceAfter=14,
            spaceBefore=0,
        )
    )

    # 2. Metadata Cards (Vendor / Billed To / Status)
    status_label = status or "Verified"
    vendor_name = vendor if vendor and vendor.strip() else "Direct Corporate Procurement"
    desc_text = description if description and description.strip() else "Authorized Material Procurement & Project Operational Invoicing"

    meta_data = [
        [
            Paragraph("VENDOR / SUPPLIER", meta_label),
            Paragraph("PAYMENT STATUS", meta_label),
            Paragraph("CURRENCY & SPEC", meta_label),
        ],
        [
            Paragraph(vendor_name, meta_value),
            Paragraph(
                f"<font color='#059669'><b>● {status_label.upper()}</b></font>",
                meta_value,
            ),
            Paragraph(f"{currency} (United Arab Emirates Dirham)", meta_value),
        ],
    ]
    meta_table = Table(meta_data, colWidths=[3.2 * inch, 2.0 * inch, 2.3 * inch])
    meta_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    elements.append(meta_table)
    elements.append(Spacer(1, 16))

    # 3. Itemized Breakdown Table
    formatted_amount = f"{total_amount:,.2f}"
    items_data = [
        [
            Paragraph("#", table_header_style),
            Paragraph("DESCRIPTION / LINE ITEM", table_header_style),
            Paragraph("QTY", table_header_right),
            Paragraph("UNIT PRICE", table_header_right),
            Paragraph("AMOUNT (AED)", table_header_right),
        ],
        [
            Paragraph("1", table_cell_style),
            Paragraph(
                f"<b>{desc_text}</b><br/><font color='#64748b' size='8'>Ref: {invoice_number} | Authenticated ERP Record</font>",
                table_cell_style,
            ),
            Paragraph("1", table_cell_right),
            Paragraph(f"AED {formatted_amount}", table_cell_right),
            Paragraph(f"AED {formatted_amount}", table_cell_bold_right),
        ],
    ]

    items_table = Table(
        items_data,
        colWidths=[0.4 * inch, 3.8 * inch, 0.6 * inch, 1.3 * inch, 1.4 * inch],
    )
    items_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#f1f5f9")),
            ]
        )
    )
    elements.append(items_table)
    elements.append(Spacer(1, 12))

    # 4. Total Summary Block
    summary_data = [
        [
            "",
            "",
            Paragraph("Subtotal:", table_cell_right),
            Paragraph(f"AED {formatted_amount}", table_cell_right),
        ],
        [
            "",
            "",
            Paragraph("VAT / Tax (0.0%):", table_cell_right),
            Paragraph("AED 0.00", table_cell_right),
        ],
        [
            "",
            "",
            Paragraph("<b>TOTAL DUE:</b>", ParagraphStyle("TotalDue", parent=table_cell_bold, fontSize=11, alignment=TA_RIGHT, textColor=colors.HexColor("#0f172a"))),
            Paragraph(f"<b>AED {formatted_amount}</b>", ParagraphStyle("TotalDueVal", parent=table_cell_bold, fontSize=11, alignment=TA_RIGHT, textColor=colors.HexColor("#0284c7"))),
        ],
    ]
    summary_table = Table(
        summary_data,
        colWidths=[2.5 * inch, 1.7 * inch, 1.8 * inch, 1.5 * inch],
    )
    summary_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LINEABOVE", (2, 2), (3, 2), 1, colors.HexColor("#0284c7")),
            ]
        )
    )
    elements.append(summary_table)
    elements.append(Spacer(1, 24))

    # 5. Security & Verification Section
    cert_data = [
        [
            Paragraph(
                "<b>DIGITAL AUTHENTICATION NOTICE</b><br/>"
                "This document has been systematically verified and authenticated through the MicroService "
                "Engineering & Cashflow Management Subsystem. All transactions are logged with cryptographic timestamps.",
                ParagraphStyle("CertNotice", parent=styles["Normal"], fontSize=7.5, leading=10.5, textColor=colors.HexColor("#64748b")),
            ),
            Paragraph(
                "<b>MICROSERVICE OPS</b><br/>"
                "<font color='#059669'>✓ VERIFIED RECORD</font><br/>"
                "<font size='7' color='#94a3b8'>Authorized Operations</font>",
                ParagraphStyle("CertStamp", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8, leading=11, alignment=TA_CENTER, textColor=colors.HexColor("#0f172a")),
            ),
        ]
    ]
    cert_table = Table(cert_data, colWidths=[5.4 * inch, 2.1 * inch])
    cert_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    elements.append(cert_table)
    elements.append(Spacer(1, 16))

    # 6. Page Footer
    elements.append(
        Paragraph(
            "MicroService ERP Platform • Automated Enterprise Accounting • Generated Dynamically",
            footer_style,
        )
    )

    doc.build(elements)
    pdf_data = buffer.getvalue()
    buffer.close()
    return pdf_data


def _fetch_image_for_reportlab(img_url_or_path: str) -> Optional[io.BytesIO]:
    """Helper to load image bytes for ReportLab from URL, data URL, or local path."""
    if not img_url_or_path:
        return None
    try:
        if img_url_or_path.startswith("data:image"):
            import base64
            comma_idx = img_url_or_path.find(",")
            if comma_idx != -1:
                b64_data = img_url_or_path[comma_idx + 1:]
                return io.BytesIO(base64.b64decode(b64_data))
        elif img_url_or_path.startswith("http://") or img_url_or_path.startswith("https://"):
            import httpx
            with httpx.Client(timeout=4.0) as client:
                r = client.get(img_url_or_path)
                if r.status_code == 200:
                    return io.BytesIO(r.content)
        elif os.path.exists(img_url_or_path):
            with open(img_url_or_path, "rb") as f:
                return io.BytesIO(f.read())
    except Exception:
        pass
    return None


def generate_site_execution_pdf_bytes(
    project_name: str,
    project_key: str,
    date_str: str,
    formatted_date_label: str,
    verified_milestone: float,
    logs: list,
) -> bytes:
    """
    Generates a structured Site Execution & Daily Progress Report PDF for a specific date or active session.
    """
    from reportlab.platypus import PageBreak, KeepTogether, Image as RLImage
    from reportlab.lib.pagesizes import A4

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "BannerTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=colors.white,
    )
    subtitle_style = ParagraphStyle(
        "BannerSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#e2e8f0"),
    )
    card_label_style = ParagraphStyle(
        "CardLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#475569"),
    )
    card_val_style = ParagraphStyle(
        "CardVal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#0f172a"),
    )
    log_title_style = ParagraphStyle(
        "LogTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#0f172a"),
    )
    log_meta_style = ParagraphStyle(
        "LogMeta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=11,
        alignment=TA_RIGHT,
        textColor=colors.HexColor("#334155"),
    )
    body_style = ParagraphStyle(
        "LogBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#1e293b"),
    )
    caption_style = ParagraphStyle(
        "ImgCaption",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7,
        leading=9,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#64748b"),
    )

    elements = []

    # 1. Header Banner
    header_table = Table(
        [
            [Paragraph("SITE EXECUTION & DAILY PROGRESS REPORT", title_style)],
            [Paragraph(f"Project: <b>{project_name}</b> ({project_key}) &nbsp;|&nbsp; Date: <b>{formatted_date_label}</b>", subtitle_style)],
        ],
        colWidths=[7.4 * inch],
    )
    header_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#0c1033")),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ])
    )
    elements.append(header_table)
    elements.append(Spacer(1, 10))

    # 2. Executive Overview Card
    overview_data = [
        [
            Paragraph(f"<b>Project Code:</b> {project_key}<br/><b>Report Date:</b> {formatted_date_label}", card_val_style),
            Paragraph(f"<b>Verified Milestone:</b> {verified_milestone}%<br/><b>Daily Logs:</b> {len(logs)} entries", card_val_style),
            Paragraph(f"<b>Exported:</b> {datetime.datetime.utcnow().strftime('%d %b %Y, %I:%M %p')}<br/><b>Status:</b> Official Report", card_val_style),
        ]
    ]
    overview_table = Table(overview_data, colWidths=[2.5 * inch, 2.4 * inch, 2.5 * inch])
    overview_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ])
    )
    elements.append(overview_table)
    elements.append(Spacer(1, 14))

    # 3. Execution Logs
    if not logs:
        elements.append(
            Paragraph(
                f"<i>No site execution logs recorded for {formatted_date_label}.</i>",
                ParagraphStyle("NoLogs", parent=styles["Normal"], textColor=colors.HexColor("#94a3b8"), fontSize=9),
            )
        )
    else:
        for idx, log in enumerate(logs):
            log_elements = []
            phase_title = log.get("phase_name") or f"Site Execution Inspection #{log.get('id', idx + 1)}"
            sup_name = log.get("supervisor_name") or "Site Supervisor"
            role = log.get("creator_role") or "Site Supervisor"
            desc = log.get("description") or "No description provided."

            # Header Box for Log
            log_hdr = Table(
                [
                    [
                        Paragraph(f"<b>Log #{idx + 1}: {phase_title}</b>", log_title_style),
                        Paragraph(f"Logged by: <b>{sup_name}</b> [{role}]", log_meta_style),
                    ]
                ],
                colWidths=[4.4 * inch, 3.0 * inch],
            )
            log_hdr.setStyle(
                TableStyle([
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f1f5f9")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ])
            )
            log_elements.append(log_hdr)
            log_elements.append(Spacer(1, 6))

            # Description
            log_elements.append(Paragraph(f"<b>Observation & Progress Notes:</b><br/>{desc}", body_style))
            log_elements.append(Spacer(1, 8))

            # Attached Photos
            raw_imgs = log.get("images") or []
            if isinstance(raw_imgs, str):
                try:
                    raw_imgs = json.loads(raw_imgs)
                except Exception:
                    raw_imgs = []

            valid_imgs = [img for img in raw_imgs if isinstance(img, dict) and img.get("url")]
            if valid_imgs:
                log_elements.append(Paragraph("<b>Attached Photographic Proof:</b>", card_label_style))
                log_elements.append(Spacer(1, 4))

                img_cells = []
                for img_idx, img_obj in enumerate(valid_imgs[:4]):
                    img_url = img_obj.get("url", "")
                    img_name = img_obj.get("name") or f"Photo #{img_idx + 1}"
                    img_buf = _fetch_image_for_reportlab(img_url)

                    cell_elements = []
                    if img_buf:
                        try:
                            rl_img = RLImage(img_buf, width=3.3 * inch, height=2.2 * inch)
                            cell_elements.append(rl_img)
                        except Exception:
                            cell_elements.append(Paragraph("<i>[Photo Attached]</i>", caption_style))
                    else:
                        cell_elements.append(Paragraph("<i>[Photo Attached - Preview Unavailable]</i>", caption_style))

                    cell_elements.append(Paragraph(img_name[:35], caption_style))
                    img_cells.append(cell_elements)

                # Pair into rows of 2
                table_rows = []
                for r_i in range(0, len(img_cells), 2):
                    row = img_cells[r_i:r_i + 2]
                    if len(row) == 1:
                        row.append([])
                    table_rows.append(row)

                if table_rows:
                    img_table = Table(table_rows, colWidths=[3.6 * inch, 3.6 * inch])
                    img_table.setStyle(
                        TableStyle([
                            ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                            ("TOPPADDING", (0, 0), (-1, -1), 4),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ])
                    )
                    log_elements.append(img_table)

            log_elements.append(Spacer(1, 14))
            elements.append(KeepTogether(log_elements))

    # Page number and footer canvas callback
    def add_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor("#94a3b8"))
        footer_text = f"Project: {project_name} ({project_key})  |  Date: {formatted_date_label}  |  Confidential & Proprietary"
        canvas.drawString(36, 20, footer_text)
        canvas.drawRightString(A4[0] - 36, 20, f"Page {canvas._pageNumber}")
        canvas.restoreState()

    doc.build(elements, onFirstPage=add_footer, onLaterPages=add_footer)
    pdf_data = buffer.getvalue()
    buffer.close()
    return pdf_data


def generate_project_dossier_pdf_bytes(
    project_info: dict,
    section_statuses: dict,
    activity_logs: list,
    commercial_stages: list,
    engineering_stages: list,
    costing_resources: list,
    procurement_items: list,
    soa_summary: dict,
    site_execution_logs: list,
) -> bytes:
    """
    Generates the complete Master Project Dossier & Full Timeline Audit PDF.
    Contains 7 project stages, financial overview, manpower, procurement, site execution, and chronological activity logs.
    """
    from reportlab.platypus import PageBreak, KeepTogether, Image as RLImage
    from reportlab.lib.pagesizes import A4

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )

    styles = getSampleStyleSheet()

    # Typography styles
    title_style = ParagraphStyle(
        "DossierTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=colors.white,
    )
    subtitle_style = ParagraphStyle(
        "DossierSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor("#e2e8f0"),
    )
    section_heading_style = ParagraphStyle(
        "SecHead",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9.5,
        leading=13,
        textColor=colors.HexColor("#0f172a"),
    )
    table_head_style = ParagraphStyle(
        "THead",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#334155"),
    )
    table_cell_style = ParagraphStyle(
        "TCell",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.2,
        leading=10,
        textColor=colors.HexColor("#1e293b"),
    )
    table_cell_bold = ParagraphStyle(
        "TCellBold",
        parent=table_cell_style,
        fontName="Helvetica-Bold",
    )

    elements = []

    # 1. Header Banner
    header_table = Table(
        [
            [Paragraph("PROJECT DOSSIER & COMPREHENSIVE AUDIT REPORT", title_style)],
            [Paragraph(f"Project: <b>{project_info.get('name', 'Project')}</b> (#{project_info.get('code', 'PRJ')}) &nbsp;|&nbsp; Generated: {datetime.datetime.utcnow().strftime('%d %b %Y, %I:%M %p')}", subtitle_style)],
        ],
        colWidths=[7.4 * inch],
    )
    header_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#0c1033")),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ])
    )
    elements.append(header_table)
    elements.append(Spacer(1, 10))

    # 2. Project Metadata Overview
    meta_table = Table(
        [
            [
                Paragraph(f"<b>Project Name:</b> {project_info.get('name', '—')}<br/><b>Project Code:</b> #{project_info.get('code', '—')}<br/><b>Client:</b> {project_info.get('client', '—')}<br/><b>Location:</b> {project_info.get('location', 'UAE')}", table_cell_style),
                Paragraph(f"<b>Manager:</b> {project_info.get('manager', 'Admin')}<br/><b>Supervisor:</b> {project_info.get('supervisor', 'Site Supervisor')}<br/><b>Start Date:</b> {project_info.get('start_date', 'N/A')}<br/><b>Stage:</b> Stage {project_info.get('current_stage', 1)} of {project_info.get('total_stages', 7)}", table_cell_style),
                Paragraph(f"<b>Priority:</b> {project_info.get('priority', 'High')}<br/><b>Budget:</b> {project_info.get('budget', 'AED 0.00')}<br/><b>Milestone:</b> {project_info.get('verified_progress_percentage', 0)}% Verified<br/><b>Export Date:</b> {datetime.datetime.utcnow().strftime('%d %b %Y')}", table_cell_style),
            ]
        ],
        colWidths=[2.5 * inch, 2.5 * inch, 2.4 * inch],
    )
    meta_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ])
    )
    elements.append(meta_table)
    elements.append(Spacer(1, 12))

    # Helper for Section Titles
    def make_sec_header(title: str):
        t = Table([[Paragraph(f"<b>{title}</b>", section_heading_style)]], colWidths=[7.4 * inch])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f1f5f9")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]))
        return t

    # 3. Section Workflow Matrix
    elements.append(make_sec_header("SECTION WORKFLOW STATUS MATRIX"))
    elements.append(Spacer(1, 4))
    matrix_rows = [
        [
            Paragraph("1. Commercial Approval", table_cell_bold),
            Paragraph(section_statuses.get("commercial", "not_started").replace("_", " ").title(), table_cell_style),
            Paragraph("2. Engineering & Documentation", table_cell_bold),
            Paragraph(section_statuses.get("engineering", "not_started").replace("_", " ").title(), table_cell_style),
        ],
        [
            Paragraph("3. Budget & Costing", table_cell_bold),
            Paragraph(section_statuses.get("budget", "not_started").replace("_", " ").title(), table_cell_style),
            Paragraph("4. Procurement Allocation", table_cell_bold),
            Paragraph(section_statuses.get("procurement", "not_started").replace("_", " ").title(), table_cell_style),
        ],
        [
            Paragraph("5. Statement of Accounts (SOA)", table_cell_bold),
            Paragraph(section_statuses.get("soa", "not_started").replace("_", " ").title(), table_cell_style),
            Paragraph("6. Resource Planning", table_cell_bold),
            Paragraph(section_statuses.get("resource", "not_started").replace("_", " ").title(), table_cell_style),
        ],
        [
            Paragraph("7. Site Execution", table_cell_bold),
            Paragraph(section_statuses.get("site_execution", "not_started").replace("_", " ").title(), table_cell_style),
            Paragraph("8. Handover Status", table_cell_bold),
            Paragraph(section_statuses.get("handover", "not_started").replace("_", " ").title(), table_cell_style),
        ],
    ]
    matrix_table = Table(matrix_rows, colWidths=[2.2 * inch, 1.5 * inch, 2.2 * inch, 1.5 * inch])
    matrix_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#f1f5f9")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(matrix_table)
    elements.append(Spacer(1, 14))

    # 4. Project Activity Timeline & Audit History
    elements.append(make_sec_header("PROJECT ACTIVITY TIMELINE & AUDIT HISTORY"))
    elements.append(Spacer(1, 4))
    if not activity_logs:
        elements.append(Paragraph("<i>No activity logs recorded for this project yet.</i>", table_cell_style))
    else:
        act_rows = [[
            Paragraph("Date & Time", table_head_style),
            Paragraph("User", table_head_style),
            Paragraph("Module", table_head_style),
            Paragraph("Action Description", table_head_style),
        ]]
        for l in activity_logs[:30]:  # Up to 30 recent entries
            t_str = l.get("time") or l.get("created_at") or "—"
            act_rows.append([
                Paragraph(str(t_str), table_cell_style),
                Paragraph(str(l.get("user", "Admin")), table_cell_bold),
                Paragraph(str(l.get("module", "—")), table_cell_style),
                Paragraph(str(l.get("action", "—")), table_cell_style),
            ])
        act_table = Table(act_rows, colWidths=[1.8 * inch, 1.2 * inch, 1.4 * inch, 3.0 * inch])
        act_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#f1f5f9")),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ]))
        elements.append(act_table)
    elements.append(Spacer(1, 14))

    # 5. Commercial Stages
    elements.append(make_sec_header("1. COMMERCIAL APPROVAL & CONTRACT STAGES"))
    elements.append(Spacer(1, 4))
    if not commercial_stages:
        elements.append(Paragraph("<i>No commercial stages created.</i>", table_cell_style))
    else:
        c_rows = [[
            Paragraph("Stage", table_head_style),
            Paragraph("PO Number", table_head_style),
            Paragraph("PO Date", table_head_style),
            Paragraph("Contract Value", table_head_style),
            Paragraph("Status", table_head_style),
        ]]
        for cs in commercial_stages:
            stg_num = cs.get("stage_number", cs.get("stageNumber", 1))
            po_no = cs.get("po_number", cs.get("poNumber", "—"))
            po_dt = cs.get("po_date", cs.get("poDate", "—"))
            c_val = cs.get("contract_value", cs.get("contractValue", "AED 0.00"))
            st = cs.get("status", "in_progress").replace("_", " ").title()
            c_rows.append([
                Paragraph(f"Stage {stg_num}", table_cell_bold),
                Paragraph(str(po_no or "—"), table_cell_style),
                Paragraph(str(po_dt or "—"), table_cell_style),
                Paragraph(str(c_val or "—"), table_cell_style),
                Paragraph(str(st), table_cell_bold),
            ])
        c_table = Table(c_rows, colWidths=[1.0 * inch, 1.8 * inch, 1.4 * inch, 1.8 * inch, 1.4 * inch])
        c_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#f1f5f9")),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ]))
        elements.append(c_table)
    elements.append(Spacer(1, 14))

    # 6. Procurement Allocation
    elements.append(make_sec_header("2. PROCUREMENT & MATERIAL ALLOCATION"))
    elements.append(Spacer(1, 4))
    if not procurement_items:
        elements.append(Paragraph("<i>No procurement items allocated.</i>", table_cell_style))
    else:
        p_rows = [[
            Paragraph("#", table_head_style),
            Paragraph("Part No", table_head_style),
            Paragraph("Product Description", table_head_style),
            Paragraph("Supplier", table_head_style),
            Paragraph("Req / Alloc", table_head_style),
            Paragraph("Status", table_head_style),
        ]]
        for idx, pi in enumerate(procurement_items[:40]):
            part = pi.get("part_no", pi.get("part", "—"))
            prod = pi.get("product_name", pi.get("product", "—"))
            ven = pi.get("vendor", "—")
            qty = pi.get("qty", 0)
            alloc = pi.get("allocated_qty", 0)
            st = pi.get("status", "Added")
            p_rows.append([
                Paragraph(str(idx + 1), table_cell_style),
                Paragraph(str(part), table_cell_bold),
                Paragraph(str(prod), table_cell_style),
                Paragraph(str(ven or "—"), table_cell_style),
                Paragraph(f"{qty} / {alloc}", table_cell_style),
                Paragraph(str(st), table_cell_bold),
            ])
        p_table = Table(p_rows, colWidths=[0.4 * inch, 1.4 * inch, 2.4 * inch, 1.4 * inch, 0.9 * inch, 0.9 * inch])
        p_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#f1f5f9")),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(p_table)
    elements.append(Spacer(1, 14))

    # 7. Statement of Accounts (SOA) Financial Summary
    if soa_summary:
        elements.append(make_sec_header("3. STATEMENT OF ACCOUNTS (FINANCIAL SUMMARY)"))
        elements.append(Spacer(1, 4))
        tot_c = soa_summary.get("total_contract", soa_summary.get("totalContract", 0.0))
        tot_r = soa_summary.get("received", 0.0)
        bal = soa_summary.get("balance", 0.0)
        soa_table = Table(
            [[
                Paragraph(f"<b>Total Contract:</b><br/>AED {tot_c:,.2f}", table_cell_style),
                Paragraph(f"<b>Total Received:</b><br/><font color='#10b981'><b>AED {tot_r:,.2f}</b></font>", table_cell_style),
                Paragraph(f"<b>Outstanding Balance:</b><br/><font color='#e11d48'><b>AED {bal:,.2f}</b></font>", table_cell_style),
            ]],
            colWidths=[2.5 * inch, 2.5 * inch, 2.4 * inch],
        )
        soa_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ]))
        elements.append(soa_table)
        elements.append(Spacer(1, 14))

    # 8. Site Execution Inspection Logs Summary
    elements.append(make_sec_header("4. SITE EXECUTION INSPECTIONS & PROGRESS LOGS"))
    elements.append(Spacer(1, 4))
    if not site_execution_logs:
        elements.append(Paragraph("<i>No site execution logs recorded yet.</i>", table_cell_style))
    else:
        se_rows = [[
            Paragraph("Date", table_head_style),
            Paragraph("Phase / Title", table_head_style),
            Paragraph("Supervisor", table_head_style),
            Paragraph("Observation Notes", table_head_style),
        ]]
        for sel in site_execution_logs[:25]:
            se_rows.append([
                Paragraph(str(sel.get("date", "—")), table_cell_style),
                Paragraph(str(sel.get("phase_name", "Site Inspection")), table_cell_bold),
                Paragraph(str(sel.get("supervisor_name", "Site Supervisor")), table_cell_style),
                Paragraph(str(sel.get("description", "—")[:120]), table_cell_style),
            ])
        se_table = Table(se_rows, colWidths=[1.1 * inch, 1.8 * inch, 1.4 * inch, 3.1 * inch])
        se_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#f1f5f9")),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(se_table)
    elements.append(Spacer(1, 14))

    # 9. Verification & Sign-off Block
    sign_table = Table(
        [
            [
                Paragraph("<b>Project Manager</b><br/>" + str(project_info.get("manager", "Admin")) + "<br/><br/>______________________", table_cell_style),
                Paragraph("<b>Site Supervisor</b><br/>" + str(project_info.get("supervisor", "Site Supervisor")) + "<br/><br/>______________________", table_cell_style),
                Paragraph("<b>Client Representative</b><br/>" + str(project_info.get("client", "Client Rep")) + "<br/><br/>______________________", table_cell_style),
            ]
        ],
        colWidths=[2.5 * inch, 2.5 * inch, 2.4 * inch],
    )
    sign_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.append(KeepTogether([
        make_sec_header("PROJECT VERIFICATION & SIGN-OFF"),
        Spacer(1, 4),
        sign_table,
    ]))

    # Footer page number callback
    def add_dossier_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor("#94a3b8"))
        canvas.drawString(36, 20, f"Project Dossier: {project_info.get('name', 'Project')} (#{project_info.get('code', 'PRJ')})  |  Exported: {datetime.datetime.utcnow().strftime('%d %b %Y')}  |  Confidential")
        canvas.drawRightString(A4[0] - 36, 20, f"Page {canvas._pageNumber}")
        canvas.restoreState()

    doc.build(elements, onFirstPage=add_dossier_footer, onLaterPages=add_dossier_footer)
    pdf_data = buffer.getvalue()
    buffer.close()
    return pdf_data

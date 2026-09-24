import io
import os
from typing import Optional
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

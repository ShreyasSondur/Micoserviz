
import os
import re
from pathlib import Path
from io import BytesIO
import openpyxl
from datetime import date, datetime, timedelta
from fastapi import Form, UploadFile, File, Response
from fastapi.responses import FileResponse
from app.config import settings

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.cashflow import PettyCashTransaction, CreditLoanItem
from app.models.invoice import Invoice
from app.schemas.cashflow import (
    PettyCashCreate,
    PettyCashResponse,
    PettyCashListResponse,
    CreditLoanCreate,
    CreditLoanResponse,
    CreditLoanListResponse,
    CashflowSummaryResponse,
)

router = APIRouter(prefix="/cashflow", tags=["Cash Flow Management"])

CASHFLOW_STORAGE_DIR = Path(settings.STORAGE_ROOT) / "Cashflow"
CASHFLOW_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

def format_file_size(size_in_bytes: int) -> str:
    if size_in_bytes < 1024:
        return f"{size_in_bytes} B"
    elif size_in_bytes < 1024 * 1024:
        return f"{size_in_bytes / 1024:.1f} KB"
    else:
        return f"{size_in_bytes / (1024 * 1024):.1f} MB"

def get_date_threshold(date_filter: str):
    if not date_filter:
        return None
    df = date_filter.strip().lower()
    today = date.today()
    if df == '7d':
        return (today - timedelta(days=7)).isoformat()
    elif df == '1m':
        return (today - timedelta(days=30)).isoformat()
    elif df == '1y':
        return (today - timedelta(days=365)).isoformat()
    return None



def compute_petty_metrics(db: Session):
    cash_in = db.query(func.sum(PettyCashTransaction.amount)).filter(
        PettyCashTransaction.is_active == True,
        PettyCashTransaction.type == "Cash In"
    ).scalar() or 0.0

    cash_out = db.query(func.sum(PettyCashTransaction.amount)).filter(
        PettyCashTransaction.is_active == True,
        PettyCashTransaction.type == "Cash Out"
    ).scalar() or 0.0

    balance = float(cash_in) - float(cash_out)
    return float(balance), float(cash_in), float(cash_out)


def compute_loans_total(db: Session):
    total = db.query(func.sum(CreditLoanItem.amount)).filter(
        CreditLoanItem.is_active == True
    ).scalar() or 0.0
    return float(total)


# ============================================================================
# SUMMARY
# ============================================================================
@router.get("/summary", response_model=CashflowSummaryResponse)
def get_cashflow_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    balance, cash_in, cash_out = compute_petty_metrics(db)
    loans_total = compute_loans_total(db)
    petty_count = db.query(PettyCashTransaction).filter(PettyCashTransaction.is_active == True).count()
    loans_count = db.query(CreditLoanItem).filter(CreditLoanItem.is_active == True).count()

    return CashflowSummaryResponse(
        petty_balance=balance,
        total_cash_in=cash_in,
        total_cash_out=cash_out,
        total_credit_loans=loans_total,
        petty_count=petty_count,
        loans_count=loans_count,
    )


# ============================================================================
# PETTY CASH TRANSACTIONS
# ============================================================================
@router.get("/petty", response_model=PettyCashListResponse)
def list_petty_cash(
    type_filter: Optional[str] = Query(None, description="Filter by 'Cash In' or 'Cash Out'"),
    search: Optional[str] = Query(None, description="Search description or invoice"),
    date_filter: Optional[str] = Query(None, description="Filter by '7d', '1m', '1y'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(PettyCashTransaction).filter(PettyCashTransaction.is_active == True)

    if type_filter and type_filter.upper() != "ALL":
        query = query.filter(PettyCashTransaction.type.ilike(type_filter.strip()))

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (PettyCashTransaction.description.ilike(term)) |
            (PettyCashTransaction.invoice_number.ilike(term))
        )

    threshold = get_date_threshold(date_filter)
    if threshold:
        query = query.filter(PettyCashTransaction.date >= threshold)

    items = query.order_by(PettyCashTransaction.created_at.desc()).all()
    balance, cash_in, cash_out = compute_petty_metrics(db)

    return PettyCashListResponse(
        items=[PettyCashResponse.model_validate(i) for i in items],
        total_balance=balance,
        total_cash_in=cash_in,
        total_cash_out=cash_out,
    )


@router.post("/petty", response_model=PettyCashResponse, status_code=status.HTTP_201_CREATED)
async def create_petty_cash(
    type: str = Form(...),
    amount: float = Form(...),
    description: str = Form(...),
    invoice_number: Optional[str] = Form(None),
    invoice_id: Optional[str] = Form(None),
    tx_date: Optional[str] = Form(None, alias="date"),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    valid_types = ["Cash In", "Cash Out"]
    if type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid transaction type. Must be one of: {', '.join(valid_types)}",
        )

    if amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transaction amount must be a positive number.",
        )

    # Validate negative balance guardrail for Cash Out
    balance, _, _ = compute_petty_metrics(db)
    if type == "Cash Out" and amount > balance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Not possible: Cash Out amount (AED {amount:,.2f}) exceeds total available petty cash balance (AED {balance:,.2f}).",
        )

    final_date = tx_date if tx_date and tx_date.strip() else date.today().isoformat()

    inv_id = invoice_id
    if invoice_number and not inv_id:
        inv = db.query(Invoice).filter(
            Invoice.invoice_number.ilike(invoice_number.strip()),
            Invoice.is_active == True,
        ).first()
        if inv:
            inv_id = str(inv.id)

    new_tx = PettyCashTransaction(
        type=type,
        amount=amount,
        invoice_number=invoice_number.strip() if invoice_number else None,
        invoice_id=inv_id,
        description=description.strip(),
        date=final_date,
        is_active=True,
    )

    db.add(new_tx)
    db.commit()
    db.refresh(new_tx)

    if file and file.filename:
        clean_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", file.filename)
        saved_filename = f"petty_{new_tx.id}_{clean_name}"
        saved_path = CASHFLOW_STORAGE_DIR / saved_filename

        contents = await file.read()
        with open(saved_path, "wb") as f_out:
            f_out.write(contents)

        new_tx.file_name = file.filename
        new_tx.file_path = str(saved_path)
        new_tx.file_size = format_file_size(len(contents))
        new_tx.file_type = (file.content_type or "application/octet-stream")[:100]

        db.commit()
        db.refresh(new_tx)

    return PettyCashResponse.model_validate(new_tx)


@router.delete("/petty/{transaction_id}")
def delete_petty_cash(
    transaction_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tx = db.query(PettyCashTransaction).filter(
        PettyCashTransaction.id == transaction_id,
        PettyCashTransaction.is_active == True,
    ).first()
    if not tx:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Petty cash transaction not found",
        )

    tx.is_active = False
    db.commit()
    return {"message": "Petty cash transaction successfully removed", "id": transaction_id}


# ============================================================================
# CREDIT & LOAN ENTRIES
# ============================================================================
@router.get("/loans", response_model=CreditLoanListResponse)
def list_credit_loans(
    search: Optional[str] = Query(None, description="Search description or invoice"),
    date_filter: Optional[str] = Query(None, description="Filter by '7d', '1m', '1y'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(CreditLoanItem).filter(CreditLoanItem.is_active == True)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (CreditLoanItem.description.ilike(term)) |
            (CreditLoanItem.invoice_number.ilike(term))
        )
        
    threshold = get_date_threshold(date_filter)
    if threshold:
        query = query.filter(CreditLoanItem.date >= threshold)

    items = query.order_by(CreditLoanItem.created_at.desc()).all()
    total = compute_loans_total(db)

    return CreditLoanListResponse(
        items=[CreditLoanResponse.model_validate(i) for i in items],
        total_amount=total,
    )


@router.post("/loans", response_model=CreditLoanResponse, status_code=status.HTTP_201_CREATED)
async def create_credit_loan(
    description: str = Form(...),
    amount: float = Form(...),
    invoice_number: Optional[str] = Form(None),
    invoice_id: Optional[str] = Form(None),
    item_date: Optional[str] = Form(None, alias="date"),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Loan / Credit amount must be a positive number.",
        )

    final_date = item_date if item_date and item_date.strip() else date.today().isoformat()

    inv_id = invoice_id
    if invoice_number and not inv_id:
        inv = db.query(Invoice).filter(
            Invoice.invoice_number.ilike(invoice_number.strip()),
            Invoice.is_active == True,
        ).first()
        if inv:
            inv_id = str(inv.id)

    new_item = CreditLoanItem(
        description=description.strip(),
        amount=amount,
        invoice_number=invoice_number.strip() if invoice_number else None,
        invoice_id=inv_id,
        date=final_date,
        is_active=True,
    )

    db.add(new_item)
    db.commit()
    db.refresh(new_item)

    if file and file.filename:
        clean_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", file.filename)
        saved_filename = f"loan_{new_item.id}_{clean_name}"
        saved_path = CASHFLOW_STORAGE_DIR / saved_filename

        contents = await file.read()
        with open(saved_path, "wb") as f_out:
            f_out.write(contents)

        new_item.file_name = file.filename
        new_item.file_path = str(saved_path)
        new_item.file_size = format_file_size(len(contents))
        new_item.file_type = (file.content_type or "application/octet-stream")[:100]

        db.commit()
        db.refresh(new_item)

    return CreditLoanResponse.model_validate(new_item)


@router.delete("/loans/{loan_id}")
def delete_credit_loan(
    loan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(CreditLoanItem).filter(
        CreditLoanItem.id == loan_id,
        CreditLoanItem.is_active == True,
    ).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Credit/Loan item not found",
        )

    item.is_active = False
    db.commit()
    return {"message": "Credit/Loan item successfully removed", "id": loan_id}

@router.get("/petty/export")
def export_petty_cash(
    type_filter: Optional[str] = Query(None, description="Filter by 'Cash In' or 'Cash Out'"),
    search: Optional[str] = Query(None, description="Search description or invoice"),
    date_filter: Optional[str] = Query(None, description="Filter by '7d', '1m', '1y'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(PettyCashTransaction).filter(PettyCashTransaction.is_active == True)

    if type_filter and type_filter.upper() != "ALL":
        query = query.filter(PettyCashTransaction.type.ilike(type_filter.strip()))

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (PettyCashTransaction.description.ilike(term)) |
            (PettyCashTransaction.invoice_number.ilike(term))
        )

    threshold = get_date_threshold(date_filter)
    if threshold:
        query = query.filter(PettyCashTransaction.date >= threshold)

    items = query.order_by(PettyCashTransaction.created_at.desc()).all()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Petty Cash"
    ws.append(["Date", "Type", "Description", "Invoice", "Amount", "Has Attachment"])

    for item in items:
        ws.append([
            item.date,
            item.type,
            item.description,
            item.invoice_number or "",
            item.amount,
            "Yes" if item.file_name else "No"
        ])

    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    
    return Response(
        content=stream.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="petty_cash_export.xlsx"'}
    )


@router.get("/loans/export")
def export_credit_loans(
    search: Optional[str] = Query(None, description="Search description or invoice"),
    date_filter: Optional[str] = Query(None, description="Filter by '7d', '1m', '1y'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(CreditLoanItem).filter(CreditLoanItem.is_active == True)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (CreditLoanItem.description.ilike(term)) |
            (CreditLoanItem.invoice_number.ilike(term))
        )
        
    threshold = get_date_threshold(date_filter)
    if threshold:
        query = query.filter(CreditLoanItem.date >= threshold)

    items = query.order_by(CreditLoanItem.created_at.desc()).all()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Credit & Loans"
    ws.append(["Date", "Description", "Invoice", "Amount", "Has Attachment"])

    for item in items:
        ws.append([
            item.date,
            item.description,
            item.invoice_number or "",
            item.amount,
            "Yes" if item.file_name else "No"
        ])

    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    
    return Response(
        content=stream.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="credit_loans_export.xlsx"'}
    )


@router.get("/petty/{transaction_id}/download")
def download_petty_document(
    transaction_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tx = db.query(PettyCashTransaction).filter(
        PettyCashTransaction.id == transaction_id, 
        PettyCashTransaction.is_active == True
    ).first()
    if not tx or not tx.file_path or not os.path.exists(tx.file_path):
        raise HTTPException(status_code=404, detail="Document not found")
        
    return FileResponse(
        path=tx.file_path,
        filename=tx.file_name or "document",
        media_type=tx.file_type or "application/octet-stream"
    )

@router.get("/loans/{loan_id}/download")
def download_loan_document(
    loan_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(CreditLoanItem).filter(
        CreditLoanItem.id == loan_id, 
        CreditLoanItem.is_active == True
    ).first()
    if not item or not item.file_path or not os.path.exists(item.file_path):
        raise HTTPException(status_code=404, detail="Document not found")
        
    return FileResponse(
        path=item.file_path,
        filename=item.file_name or "document",
        media_type=item.file_type or "application/octet-stream"
    )

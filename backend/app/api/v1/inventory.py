from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.inventory import InventoryItem, MasterPart
from app.models.invoice import Invoice
from app.schemas.inventory import (
    InventoryCreate,
    InventoryUpdate,
    InventoryResponse,
    InventoryListResponse,
    PartCreate,
    PartResponse,
    PartListResponse,
    PartAllocationOverviewSchema,
    ActiveProjectAllocationSchema,
    PartDrillDownDetailsResponse,
)
from app.services.inventory_allocation import recalculate_allocations_for_part, get_part_allocations, get_part_full_details

router = APIRouter(prefix="/inventory", tags=["Master Inventory"])


@router.get("/parts", response_model=PartListResponse)
def list_master_parts(
    search: Optional[str] = Query(None, description="Search registered part number or description"),
    db: Session = Depends(get_db),
):
    query = db.query(MasterPart).filter(MasterPart.is_active == True)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                MasterPart.part_number.ilike(term),
                MasterPart.product_name.ilike(term),
                MasterPart.description.ilike(term),
            )
        )

    parts = query.order_by(MasterPart.part_number.asc()).all()
    return PartListResponse(
        items=[PartResponse.model_validate(p) for p in parts],
        total_count=len(parts),
    )


@router.get("/parts/{part_number}/details", response_model=PartDrillDownDetailsResponse)
def get_master_part_details(
    part_number: str,
    db: Session = Depends(get_db),
):
    details = get_part_full_details(part_number, db)
    return PartDrillDownDetailsResponse(**details)


@router.post("/parts", response_model=PartResponse, status_code=status.HTTP_201_CREATED)
def create_master_part(
    part_in: PartCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    part_num = part_in.part_number.strip().upper()
    if not part_num:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Part number is required.",
        )

    existing = db.query(MasterPart).filter(
        MasterPart.part_number.ilike(part_num)
    ).first()

    if existing:
        if existing.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Part number '{part_num}' is already registered.",
            )
        else:
            # Reactivate if previously deactivated
            existing.is_active = True
            if part_in.product_name:
                existing.product_name = part_in.product_name.strip()
            if part_in.description:
                existing.description = part_in.description.strip()
            db.commit()
            db.refresh(existing)
            return PartResponse.model_validate(existing)

    new_part = MasterPart(
        part_number=part_num,
        product_name=part_in.product_name.strip() if part_in.product_name else "",
        description=part_in.description.strip() if part_in.description else "",
        is_active=True,
    )
    db.add(new_part)
    db.commit()
    db.refresh(new_part)
    return PartResponse.model_validate(new_part)


@router.delete("/parts/{part_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_master_part(
    part_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    part = db.query(MasterPart).filter(
        (MasterPart.id == part_id) | (MasterPart.part_number == part_id)
    ).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    part.is_active = False
    db.commit()
    return None


@router.get("", response_model=InventoryListResponse)
def list_inventory_items(
    search: Optional[str] = Query(None, description="Search product name, brand, part, vendor, or invoice"),
    db: Session = Depends(get_db),
):
    query = db.query(InventoryItem).filter(InventoryItem.is_active == True)

    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                InventoryItem.product_name.ilike(term),
                InventoryItem.brand.ilike(term),
                InventoryItem.part_number.ilike(term),
                InventoryItem.vendor.ilike(term),
                InventoryItem.invoice_number.ilike(term),
            )
        )

    items = query.order_by(InventoryItem.created_at.desc()).all()

    # Precalculate allocation data for distinct parts
    distinct_parts = {i.part_number.strip().upper() for i in items if i.part_number}
    part_alloc_map = {}
    for p_num in distinct_parts:
        part_alloc_map[p_num] = get_part_allocations(p_num, db)

    resp_items = []
    for i in items:
        p_num = (i.part_number or "").strip().upper()
        alloc_data = part_alloc_map.get(p_num, {})
        resp = InventoryResponse.model_validate(i)
        resp.available_quantity = int(alloc_data.get("available_in_warehouse", i.quantity or 0))
        resp.allocated_quantity = int(alloc_data.get("total_allocated", 0))
        resp.active_projects_count = len(alloc_data.get("active_projects", []))
        resp_items.append(resp)

    return InventoryListResponse(
        items=resp_items,
        total_count=len(resp_items),
    )


@router.get("/{item_id}", response_model=InventoryResponse)
def get_inventory_item(
    item_id: str,
    db: Session = Depends(get_db),
):
    item = db.query(InventoryItem).filter(
        InventoryItem.id == item_id,
        InventoryItem.is_active == True,
    ).first()

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventory item not found",
        )
    return InventoryResponse.model_validate(item)


@router.post("", response_model=InventoryResponse, status_code=status.HTTP_201_CREATED)
def create_inventory_item(
    item_in: InventoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inv_num = item_in.invoice_number.strip().upper()
    if not inv_num:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invoice number is required. Please select a valid invoice from the list.",
        )

    # Validate that invoice exists in DB
    invoice = None
    if item_in.invoice_id:
        invoice = db.query(Invoice).filter(
            Invoice.id == item_in.invoice_id,
            Invoice.is_active == True,
        ).first()

    if not invoice:
        invoice = db.query(Invoice).filter(
            Invoice.invoice_number.ilike(inv_num),
            Invoice.is_active == True,
        ).first()

    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invoice '{inv_num}' does not exist in the database. Please select an existing invoice.",
        )

    # Validate that part number is registered in MasterPart
    part_num = item_in.part_number.strip().upper()
    if not part_num:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Part number is required. Please select a registered part number.",
        )

    part_obj = db.query(MasterPart).filter(
        MasterPart.part_number.ilike(part_num),
        MasterPart.is_active == True,
    ).first()

    if not part_obj:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Part number '{item_in.part_number.strip()}' is not registered. Please select a registered part or register it first under 'Add Part'.",
        )

    # Use item vendor or fallback to invoice vendor
    final_vendor = item_in.vendor.strip() if (item_in.vendor and item_in.vendor.strip()) else (invoice.vendor or "")
    availability_val = (item_in.availability.strip() if getattr(item_in, "availability", None) else "Available") or "Available"

    # Use item product_name or fallback to MasterPart product_name or description
    final_product_name = item_in.product_name.strip() if (item_in.product_name and item_in.product_name.strip()) else (part_obj.product_name or part_obj.description or part_obj.part_number)
    final_brand = item_in.brand.strip() if (item_in.brand and item_in.brand.strip()) else (part_obj.brand or "")

    new_item = InventoryItem(
        product_name=final_product_name,
        vendor=final_vendor,
        brand=final_brand,
        part_number=part_obj.part_number,
        quantity=max(1, int(item_in.quantity)),
        invoice_id=invoice.id,
        invoice_number=invoice.invoice_number,
        availability=availability_val,
        is_active=True,
    )

    db.add(new_item)
    db.commit()
    db.refresh(new_item)

    # Immediately fulfill shortages in active projects FIFO
    if new_item.part_number:
        recalculate_allocations_for_part(new_item.part_number, db)

    alloc_data = get_part_allocations(new_item.part_number, db)
    resp = InventoryResponse.model_validate(new_item)
    resp.available_quantity = int(alloc_data.get("available_in_warehouse", new_item.quantity or 0))
    resp.allocated_quantity = int(alloc_data.get("total_allocated", 0))
    resp.active_projects_count = len(alloc_data.get("active_projects", []))
    return resp


@router.get("/part/{part_number}/allocations", response_model=PartAllocationOverviewSchema)
def get_allocations_for_part(part_number: str, db: Session = Depends(get_db)):
    """
    Returns total stock, allocated units, available units, and list of active projects (excluding completed projects).
    """
    data = get_part_allocations(part_number, db)
    return PartAllocationOverviewSchema(**data)


@router.put("/{item_id}", response_model=InventoryResponse)
def update_inventory_item(
    item_id: str,
    item_in: InventoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(InventoryItem).filter(
        InventoryItem.id == item_id,
        InventoryItem.is_active == True,
    ).first()

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventory item not found",
        )

    old_part_num = item.part_number

    if item_in.invoice_number is not None:
        inv_num = item_in.invoice_number.strip().upper()
        if inv_num:
            invoice = None
            if item_in.invoice_id:
                invoice = db.query(Invoice).filter(
                    Invoice.id == item_in.invoice_id,
                    Invoice.is_active == True,
                ).first()
            if not invoice:
                invoice = db.query(Invoice).filter(
                    Invoice.invoice_number.ilike(inv_num),
                    Invoice.is_active == True,
                ).first()
            if invoice:
                item.invoice_id = invoice.id
                item.invoice_number = invoice.invoice_number
            else:
                item.invoice_number = item_in.invoice_number.strip()
        else:
            item.invoice_number = ""
            item.invoice_id = None

    if item_in.part_number is not None:
        part_num = item_in.part_number.strip().upper()
        if part_num:
            part_obj = db.query(MasterPart).filter(
                MasterPart.part_number.ilike(part_num),
                MasterPart.is_active == True,
            ).first()
            if not part_obj:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Part number '{item_in.part_number.strip()}' is not registered.",
                )
            item.part_number = part_obj.part_number

    if item_in.product_name is not None:
        item.product_name = item_in.product_name.strip()
    if item_in.brand is not None:
        item.brand = item_in.brand.strip()
    if item_in.vendor is not None:
        item.vendor = item_in.vendor.strip()
    if item_in.quantity is not None:
        item.quantity = max(1, int(item_in.quantity))
    if item_in.availability is not None:
        item.availability = item_in.availability.strip() or "Available"

    db.commit()
    db.refresh(item)

    if old_part_num:
        recalculate_allocations_for_part(old_part_num, db)
    if item.part_number and item.part_number != old_part_num:
        recalculate_allocations_for_part(item.part_number, db)

    alloc_data = get_part_allocations(item.part_number, db) if item.part_number else {}
    resp = InventoryResponse.model_validate(item)
    resp.available_quantity = int(alloc_data.get("available_in_warehouse", item.quantity or 0))
    resp.allocated_quantity = int(alloc_data.get("total_allocated", 0))
    resp.active_projects_count = len(alloc_data.get("active_projects", []))
    return resp


@router.delete("/{item_id}")
def delete_inventory_item(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(InventoryItem).filter(
        InventoryItem.id == item_id,
        InventoryItem.is_active == True,
    ).first()

    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventory item not found",
        )

    part_num = item.part_number
    item.is_active = False
    db.commit()

    if part_num:
        recalculate_allocations_for_part(part_num, db)

    return {"message": f"Inventory item '{item.product_name}' successfully removed", "id": item_id}



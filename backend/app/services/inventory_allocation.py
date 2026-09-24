"""
Inventory Allocation Engine.
Manages stock allocation between Master Inventory and Active Projects.
Enforces dynamic statuses: 'Added', 'Partially Added', 'Yet To Order', and 'Yet To Deliver'.
Excludes completed projects from active inventory assignment views.
"""

from typing import Dict, Any, List
from sqlalchemy.orm import Session
from app.models.inventory import InventoryItem, MasterPart
from app.models.project import Project, ProjectCostingItem, ProjectProcurementItem


def recalculate_allocations_for_part(part_number: str, db: Session) -> Dict[str, Any]:
    """
    Recalculates stock allocation for a given part number across active projects FIFO.
    First fulfills completed projects (consumed units), then active projects.
    Updates ProjectProcurementItem allocated_qty and status in DB.
    """
    if not part_number:
        return {
            "part_number": "",
            "total_received": 0.0,
            "total_allocated": 0.0,
            "available_in_warehouse": 0.0,
            "active_projects": [],
        }

    norm_part = part_number.strip().upper()

    # 1. Total stock received in Master Inventory
    inventory_items = db.query(InventoryItem).filter(
        InventoryItem.part_number.ilike(norm_part),
        InventoryItem.is_active == True,
    ).all()
    total_stock = float(sum(max(0, it.quantity or 0) for it in inventory_items))

    # 2. Query ProjectProcurementItems requiring this part
    proc_items = (
        db.query(ProjectProcurementItem)
        .filter(ProjectProcurementItem.part_no.ilike(norm_part))
        .order_by(ProjectProcurementItem.id.asc())
        .all()
    )

    target_items = proc_items

    completed_items = []
    active_items = []

    for item in target_items:
        proj = item.project
        if not proj:
            proj = db.query(Project).filter(Project.project_key == item.project_key).first()

        is_completed = bool(
            proj and (
                proj.is_completed
                or (proj.handover_status or "").strip().lower() == "completed"
                or (proj.current_stage is not None and proj.current_stage >= 7 and (proj.handover_status or "").strip().lower() == "completed")
            )
        )
        if is_completed:
            completed_items.append(item)
        else:
            active_items.append(item)

    # 3. Stock Pool calculation
    # Completed projects: units physically installed / consumed on site (they have left the warehouse)
    total_consumed_by_completed = 0.0
    for item in completed_items:
        req = float(item.qty or 0.0)
        alloc = min(float(item.allocated_qty or 0.0), req) if item.allocated_qty else req
        item.allocated_qty = alloc
        total_consumed_by_completed += alloc

        new_status = "Added" if alloc >= req and req > 0 else ("Partially Added" if alloc > 0 else getattr(item, "status", getattr(item, "procurement_status", "Yet To Order")))
        if hasattr(item, "status"):
            item.status = new_status
        if hasattr(item, "procurement_status"):
            item.procurement_status = new_status

    # Total physically inside the warehouse right now: total received minus stock consumed by completed projects
    total_in_warehouse = max(0.0, total_stock - total_consumed_by_completed)

    # Active projects: respect each project's actual allocated quantity (do not overwrite with auto-FIFO)
    total_allocated_to_active = 0.0
    project_groups: Dict[str, Dict[str, Any]] = {}

    for item in active_items:
        req = float(item.qty or 0.0)
        user_alloc = max(0.0, float(item.allocated_qty or 0.0))
        # Clamp allocation so it doesn't exceed requirement
        alloc = min(user_alloc, req)
        item.allocated_qty = alloc
        total_allocated_to_active += alloc

        current_st = getattr(item, "status", getattr(item, "procurement_status", "Yet To Order")) or "Yet To Order"
        if alloc >= req and req > 0:
            new_st = "Added"
        elif alloc > 0:
            new_st = "Partially Added"
        else:
            new_st = "Yet To Deliver" if current_st == "Yet To Deliver" else "Yet To Order"

        if hasattr(item, "status"):
            item.status = new_st
        if hasattr(item, "procurement_status"):
            item.procurement_status = new_st

        # Group by project_key for clean presentation in Master Inventory drilldown
        p_key = item.project_key
        proj = item.project or db.query(Project).filter(Project.project_key == p_key).first()
        if p_key not in project_groups:
            project_groups[p_key] = {
                "project_key": p_key,
                "project_name": proj.name if proj else p_key,
                "project_code": proj.code if proj else p_key,
                "required_qty": 0.0,
                "allocated_qty": 0.0,
                "has_yet_to_deliver": False,
            }
        project_groups[p_key]["required_qty"] += req
        project_groups[p_key]["allocated_qty"] += alloc
        if new_st == "Yet To Deliver":
            project_groups[p_key]["has_yet_to_deliver"] = True

    active_projects_list: List[Dict[str, Any]] = []
    for p_key, p_info in project_groups.items():
        p_req = p_info["required_qty"]
        p_alloc = p_info["allocated_qty"]
        p_rem = max(0.0, p_req - p_alloc)
        if p_alloc >= p_req and p_req > 0:
            st = "Added"
        elif p_alloc > 0:
            st = "Partially Added"
        elif p_info["has_yet_to_deliver"]:
            st = "Yet To Deliver"
        else:
            st = "Yet To Order"

        active_projects_list.append({
            "project_key": p_key,
            "project_name": p_info["project_name"],
            "project_code": p_info["project_code"],
            "required_qty": p_req,
            "allocated_qty": p_alloc,
            "remaining_qty": p_rem,
            "status": st,
        })

    db.commit()

    # Remaining in warehouse: physical stock in warehouse after current active allocations
    remaining_in_warehouse = max(0.0, total_in_warehouse - total_allocated_to_active)

    return {
        "part_number": norm_part,
        "total_received": total_stock,
        "total_inventory": total_stock,
        "total_in_warehouse": total_in_warehouse,
        "total_allocated": total_allocated_to_active,
        "available_in_warehouse": remaining_in_warehouse,
        "remaining_in_warehouse": remaining_in_warehouse,
        "total_consumed": total_consumed_by_completed,
        "active_projects": active_projects_list,
    }


def get_part_allocations(part_number: str, db: Session) -> Dict[str, Any]:
    """
    Returns the dynamic allocation overview and active projects list for a part number.
    Always excludes completed projects.
    """
    return recalculate_allocations_for_part(part_number, db)


def get_part_full_details(part_number: str, db: Session) -> Dict[str, Any]:
    """
    Returns full drill-down data for a part number:
    - Master Part info (product_name, description)
    - Stock summary (total_inventory, total_allocated, available_in_warehouse, total_consumed)
    - Active project allocations (strictly non-completed projects)
    - Linked invoice purchase history (for warranty and code claims)
    """
    norm_part = part_number.strip().upper()
    master_part = db.query(MasterPart).filter(
        MasterPart.part_number.ilike(norm_part),
        MasterPart.is_active == True,
    ).first()

    prod_name = master_part.product_name if master_part and master_part.product_name else ""
    desc = master_part.description if master_part and master_part.description else ""

    # Allocation overview
    alloc_data = recalculate_allocations_for_part(norm_part, db)

    # Linked Invoices history
    inv_items = db.query(InventoryItem).filter(
        InventoryItem.part_number.ilike(norm_part),
        InventoryItem.is_active == True,
    ).order_by(InventoryItem.created_at.desc()).all()

    linked_invoices = []
    for it in inv_items:
        inv = it.invoice
        # If product name wasn't set on MasterPart, pick from inventory item
        if not prod_name and it.product_name:
            prod_name = it.product_name

        linked_invoices.append({
            "invoice_number": it.invoice_number or (inv.invoice_number if inv else ""),
            "invoice_id": it.invoice_id or (inv.id if inv else None),
            "vendor": it.vendor or (inv.vendor if inv else ""),
            "invoice_date": inv.invoice_date if inv else "",
            "quantity": int(it.quantity or 0),
            "file_name": inv.file_name if inv else None,
            "has_file": bool(inv and (inv.file_path or inv.file_name)),
            "created_at": it.created_at,
        })

    # Project-to-Invoice Traceability mapping (FIFO attribution)
    # 1. Gather all inbound stock batches chronologically (oldest first)
    inbound_batches = []
    inv_items_asc = db.query(InventoryItem).filter(
        InventoryItem.part_number.ilike(norm_part),
        InventoryItem.is_active == True,
    ).order_by(InventoryItem.created_at.asc()).all()

    for it in inv_items_asc:
        inv = it.invoice
        inv_date_val = ""
        if inv and inv.invoice_date:
            inv_date_val = str(inv.invoice_date)
        elif it.created_at:
            inv_date_val = it.created_at.strftime("%Y-%m-%d")

        inbound_batches.append({
            "invoice_number": it.invoice_number or (inv.invoice_number if inv else "") or "General Stock",
            "invoice_id": it.invoice_id or (inv.id if inv else None),
            "vendor": it.vendor or (inv.vendor if inv else "") or "-",
            "invoice_date": inv_date_val,
            "total_qty": float(it.quantity or 0.0),
            "remaining_qty": float(it.quantity or 0.0),
            "file_name": inv.file_name if inv else None,
            "has_file": bool(inv and (inv.file_path or inv.file_name)),
        })

    # 2. Consume units that were used by completed projects first
    all_proc_items = (
        db.query(ProjectProcurementItem)
        .filter(ProjectProcurementItem.part_no.ilike(norm_part))
        .order_by(ProjectProcurementItem.id.asc())
        .all()
    )
    for it in all_proc_items:
        proj = it.project or db.query(Project).filter(Project.project_key == it.project_key).first()
        is_completed = bool(
            proj and (
                proj.is_completed
                or (proj.handover_status or "").strip().lower() == "completed"
                or (proj.current_stage is not None and proj.current_stage >= 7 and (proj.handover_status or "").strip().lower() == "completed")
            )
        )
        if is_completed:
            c_need = float(it.allocated_qty or it.qty or 0.0)
            for b in inbound_batches:
                if c_need <= 0:
                    break
                if b["remaining_qty"] <= 0:
                    continue
                take = min(c_need, b["remaining_qty"])
                b["remaining_qty"] -= take
                c_need -= take

    # 3. Attribute remaining batches to active project allocations
    active_proc = [
        it for it in all_proc_items
        if not bool(
            (it.project or db.query(Project).filter(Project.project_key == it.project_key).first())
            and (
                (it.project or db.query(Project).filter(Project.project_key == it.project_key).first()).is_completed
                or ((it.project or db.query(Project).filter(Project.project_key == it.project_key).first()).handover_status or "").strip().lower() == "completed"
                or ((it.project or db.query(Project).filter(Project.project_key == it.project_key).first()).current_stage is not None and (it.project or db.query(Project).filter(Project.project_key == it.project_key).first()).current_stage >= 7 and ((it.project or db.query(Project).filter(Project.project_key == it.project_key).first()).handover_status or "").strip().lower() == "completed")
            )
        ) and float(it.allocated_qty or 0.0) > 0
    ]

    project_invoice_allocations = []
    for it in active_proc:
        proj = it.project or db.query(Project).filter(Project.project_key == it.project_key).first()
        p_name = proj.name if proj else it.project_key
        p_code = proj.code if proj else it.project_key
        needed = float(it.allocated_qty or 0.0)

        # First check if explicitly tagged to an invoice
        if it.invoice_number and it.invoice_number.strip():
            target_no = it.invoice_number.strip().upper()
            matched_b = next((b for b in inbound_batches if (b["invoice_number"] or "").upper() == target_no and b["remaining_qty"] > 0), None)
            if matched_b:
                take = min(needed, matched_b["remaining_qty"])
                project_invoice_allocations.append({
                    "project_key": it.project_key,
                    "project_name": p_name,
                    "project_code": p_code,
                    "vendor": matched_b["vendor"] or it.vendor or "-",
                    "quantity": take,
                    "invoice_number": matched_b["invoice_number"],
                    "invoice_id": matched_b["invoice_id"],
                    "invoice_date": matched_b["invoice_date"],
                    "file_name": matched_b["file_name"],
                    "has_file": matched_b["has_file"],
                })
                matched_b["remaining_qty"] -= take
                needed -= take

        # Distribute FIFO across remaining batches
        for b in inbound_batches:
            if needed <= 0:
                break
            if b["remaining_qty"] <= 0:
                continue
            take = min(needed, b["remaining_qty"])
            project_invoice_allocations.append({
                "project_key": it.project_key,
                "project_name": p_name,
                "project_code": p_code,
                "vendor": b["vendor"] or it.vendor or "-",
                "quantity": take,
                "invoice_number": b["invoice_number"],
                "invoice_id": b["invoice_id"],
                "invoice_date": b["invoice_date"],
                "file_name": b["file_name"],
                "has_file": b["has_file"],
            })
            b["remaining_qty"] -= take
            needed -= take

        if needed > 0:
            project_invoice_allocations.append({
                "project_key": it.project_key,
                "project_name": p_name,
                "project_code": p_code,
                "vendor": it.vendor or "-",
                "quantity": needed,
                "invoice_number": "Unassigned Batch",
                "invoice_id": None,
                "invoice_date": it.created_at.strftime("%Y-%m-%d") if it.created_at else "-",
                "file_name": None,
                "has_file": False,
            })

    return {
        "part_number": norm_part,
        "product_name": prod_name or norm_part,
        "description": desc,
        "total_inventory": alloc_data["total_received"],
        "total_in_warehouse": alloc_data["total_in_warehouse"],
        "total_allocated": alloc_data["total_allocated"],
        "available_in_warehouse": alloc_data["available_in_warehouse"],
        "remaining_in_warehouse": alloc_data["remaining_in_warehouse"],
        "total_consumed": alloc_data.get("total_consumed", 0.0),
        "active_projects": alloc_data["active_projects"],
        "linked_invoices": linked_invoices,
        "project_invoice_allocations": project_invoice_allocations,
    }


def recalculate_all_allocations(db: Session) -> None:
    """
    Refreshes allocations for all distinct parts across the system.
    """
    distinct_parts = set()

    for p in db.query(MasterPart.part_number).filter(MasterPart.is_active == True).all():
        if p[0]:
            distinct_parts.add(p[0].strip().upper())

    for i in db.query(InventoryItem.part_number).filter(InventoryItem.is_active == True).all():
        if i[0]:
            distinct_parts.add(i[0].strip().upper())

    for pr in db.query(ProjectProcurementItem.part_no).all():
        if pr[0]:
            distinct_parts.add(pr[0].strip().upper())

    for c in db.query(ProjectCostingItem.part_no).all():
        if c[0]:
            distinct_parts.add(c[0].strip().upper())

    for part in distinct_parts:
        recalculate_allocations_for_part(part, db)

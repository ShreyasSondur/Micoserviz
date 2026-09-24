"""
Automated tests for Master Inventory Allocation Engine.
"""

import sys
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.project import Project, ProjectCostingItem
from app.models.inventory import InventoryItem, MasterPart
from app.services.inventory_allocation import recalculate_allocations_for_part, get_part_allocations


def test_allocation_engine():
    db: Session = SessionLocal()
    try:
        test_part = "TEST-ALLOC-999"

        # 1. Register part in MasterPart
        part = db.query(MasterPart).filter(MasterPart.part_number == test_part).first()
        if not part:
            part = MasterPart(part_number=test_part, description="Test Allocation Sensor", is_active=True)
            db.add(part)
            db.commit()

        # Clean any previous test data
        db.query(InventoryItem).filter(InventoryItem.part_number == test_part).delete()
        db.query(ProjectCostingItem).filter(ProjectCostingItem.part_no == test_part).delete()
        db.commit()

        # Ensure two test projects exist: test_p_act (Active) and test_p_comp (Completed)
        p_act = db.query(Project).filter(Project.project_key == "test_p_act").first()
        if not p_act:
            p_act = Project(project_key="test_p_act", name="Active Tower", code="ACT-01", client="Test Client", is_completed=False)
            db.add(p_act)
        else:
            p_act.is_completed = False
            p_act.handover_status = "in_progress"

        p_comp = db.query(Project).filter(Project.project_key == "test_p_comp").first()
        if not p_comp:
            p_comp = Project(project_key="test_p_comp", name="Completed Hotel", code="CMP-01", client="Test Client", is_completed=True)
            db.add(p_comp)
        else:
            p_comp.is_completed = True
            p_comp.handover_status = "completed"

        db.commit()

        # Case 1: Initial state - 0 stock in Master Inventory
        # Add a costing item for Active Tower requiring 10 units
        item_act = ProjectCostingItem(
            project_key="test_p_act",
            sl_no=1,
            part_no=test_part,
            description="Sensor Unit",
            qty=10.0,
            procurement_status="Yet To Order",
            allocated_qty=0.0,
        )
        db.add(item_act)
        db.commit()

        alloc = recalculate_allocations_for_part(test_part, db)
        db.refresh(item_act)
        assert item_act.procurement_status == "Yet To Order", f"Expected 'Yet To Order', got {item_act.procurement_status}"
        assert item_act.allocated_qty == 0.0
        assert alloc["available_in_warehouse"] == 0.0
        assert len(alloc["active_projects"]) == 1
        assert alloc["active_projects"][0]["status"] == "Yet To Order"
        assert alloc["active_projects"][0]["remaining_qty"] == 10.0
        print("PASS: Case 1 (0 stock -> 'Yet To Order')")

        # Case 2: Partial stock arrives (e.g. 4 units added via invoice)
        inv1 = InventoryItem(
            product_name="Sensor Unit",
            brand="Standard",
            part_number=test_part,
            quantity=4,
            invoice_number="INV-T1",
            availability="Available",
            is_active=True,
        )
        db.add(inv1)
        db.commit()

        alloc2 = recalculate_allocations_for_part(test_part, db)
        db.refresh(item_act)
        assert item_act.procurement_status == "Partially Added", f"Expected 'Partially Added', got {item_act.procurement_status}"
        assert item_act.allocated_qty == 4.0
        assert alloc2["available_in_warehouse"] == 0.0
        assert alloc2["total_allocated"] == 4.0
        assert alloc2["active_projects"][0]["remaining_qty"] == 6.0
        print("PASS: Case 2 (Partial stock (4/10) -> 'Partially Added', remaining 6.0)")

        # Case 3: More stock arrives (e.g. 10 more units added via invoice, total = 14)
        inv2 = InventoryItem(
            product_name="Sensor Unit",
            brand="Standard",
            part_number=test_part,
            quantity=10,
            invoice_number="INV-T2",
            availability="Available",
            is_active=True,
        )
        db.add(inv2)
        db.commit()

        alloc3 = recalculate_allocations_for_part(test_part, db)
        db.refresh(item_act)
        assert item_act.procurement_status == "Added", f"Expected 'Added', got {item_act.procurement_status}"
        assert item_act.allocated_qty == 10.0
        assert alloc3["total_received"] == 14.0
        assert alloc3["total_allocated"] == 10.0
        assert alloc3["available_in_warehouse"] == 4.0, f"Expected 4.0 in warehouse, got {alloc3['available_in_warehouse']}"
        assert alloc3["active_projects"][0]["remaining_qty"] == 0.0
        print("PASS: Case 3 (Full stock satisfied (10/10) -> 'Added', warehouse has 4.0 available)")

        # Case 4: Add costing item in Completed Hotel requiring 4 units
        # Completed projects consume allocated stock, but are excluded from active drilldown
        item_comp = ProjectCostingItem(
            project_key="test_p_comp",
            sl_no=1,
            part_no=test_part,
            description="Sensor Unit",
            qty=4.0,
            procurement_status="Added",
            allocated_qty=4.0,
        )
        db.add(item_comp)
        db.commit()

        alloc4 = get_part_allocations(test_part, db)
        # Verify completed project is EXCLUDED from active_projects
        active_keys = [p["project_key"] for p in alloc4["active_projects"]]
        assert "test_p_comp" not in active_keys, "Completed project must not appear in active allocations!"
        assert "test_p_act" in active_keys
        print("PASS: Case 4 (Completed projects excluded from active_projects drilldown)")

        # Clean up test rows
        db.query(InventoryItem).filter(InventoryItem.part_number == test_part).delete()
        db.query(ProjectCostingItem).filter(ProjectCostingItem.part_no == test_part).delete()
        db.delete(p_act)
        db.delete(p_comp)
        db.delete(part)
        db.commit()

        print("\nAll 4 automated allocation engine tests PASSED perfectly!")
    finally:
        db.close()


if __name__ == "__main__":
    test_allocation_engine()

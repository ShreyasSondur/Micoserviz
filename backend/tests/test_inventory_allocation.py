"""
Automated tests for Master Inventory Allocation Engine.
Covers:
- Test 1: Full quantity available -> Status is Added, warehouse available decrements.
- Test 2: Partial quantity available -> Status is Partially Added (allocated = available, remaining = qty - available).
- Test 3: Zero quantity available -> Status is Yet To Order (allocated = 0, remaining = qty).
- Test 4: Adding new invoice in Master Inventory -> Shortage in active projects is fulfilled FIFO, status upgrades to Added.
- Test 5: Marking project as Completed -> Project is excluded from GET /inventory/part/{part}/allocations active projects list.
"""

import sys
import os
from pathlib import Path

# Add backend directory to sys.path so app imports work
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.project import Project, ProjectCostingItem
from app.models.inventory import InventoryItem, MasterPart
from app.services.inventory_allocation import recalculate_allocations_for_part, get_part_allocations


def test_allocation_engine():
    db: Session = SessionLocal()
    try:
        test_part = "TEST-ALLOC-ENG-01"

        # Register part in MasterPart
        part = db.query(MasterPart).filter(MasterPart.part_number == test_part).first()
        if not part:
            part = MasterPart(part_number=test_part, description="Test Allocation Smart Sensor", is_active=True)
            db.add(part)
            db.commit()

        # Clean any previous test data
        db.query(InventoryItem).filter(InventoryItem.part_number == test_part).delete()
        db.query(ProjectCostingItem).filter(ProjectCostingItem.part_no == test_part).delete()
        db.commit()

        # Ensure two test projects exist: test_p_act (Active) and test_p_comp (Completed)
        p_act = db.query(Project).filter(Project.project_key == "test_p_act").first()
        if not p_act:
            p_act = Project(project_key="test_p_act", name="Active Automation Tower", code="ACT-01", client="Test Client", is_completed=False)
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

        # -------------------------------------------------------------
        # TEST 3: Zero quantity available -> Status is Yet To Order
        # -------------------------------------------------------------
        item_act = ProjectCostingItem(
            project_key="test_p_act",
            sl_no=1,
            part_no=test_part,
            description="Smart Sensor Unit",
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
        print("PASS: Test 3 (Zero quantity available -> Status is Yet To Order (allocated = 0, remaining = 10))")

        # -------------------------------------------------------------
        # TEST 2: Partial quantity available -> Status is Partially Added
        # -------------------------------------------------------------
        inv1 = InventoryItem(
            product_name="Smart Sensor Unit",
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
        print("PASS: Test 2 (Partial quantity available -> Status is Partially Added (allocated = 4, remaining = 6))")

        # -------------------------------------------------------------
        # TEST 4 & TEST 1: Adding new invoice in Master Inventory ->
        # Shortage in active projects is fulfilled FIFO, status upgrades to Added
        # Full quantity available -> Status is Added, warehouse available decrements
        # -------------------------------------------------------------
        inv2 = InventoryItem(
            product_name="Smart Sensor Unit",
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
        print("PASS: Test 1 & 4 (New invoice fulfills shortage FIFO -> Status upgraded to Added, 4 left in warehouse)")

        # -------------------------------------------------------------
        # TEST 5: Marking project as Completed -> Project is excluded
        # from GET /inventory/part/{part}/allocations active projects list
        # -------------------------------------------------------------
        item_comp = ProjectCostingItem(
            project_key="test_p_comp",
            sl_no=1,
            part_no=test_part,
            description="Smart Sensor Unit",
            qty=4.0,
            procurement_status="Added",
            allocated_qty=4.0,
        )
        db.add(item_comp)
        db.commit()

        alloc4 = get_part_allocations(test_part, db)
        active_keys = [p["project_key"] for p in alloc4["active_projects"]]
        assert "test_p_comp" not in active_keys, "Completed project must not appear in active allocations!"
        assert "test_p_act" in active_keys, "Active project must appear in active allocations!"
        print("PASS: Test 5 (Completed projects excluded from active_projects drilldown list)")

        # Clean up test rows
        db.query(InventoryItem).filter(InventoryItem.part_number == test_part).delete()
        db.query(ProjectCostingItem).filter(ProjectCostingItem.part_no == test_part).delete()
        db.delete(p_act)
        db.delete(p_comp)
        db.delete(part)
        db.commit()

        print("\nALL 5 AUTOMATED TESTS PASSED SUCCESSFULLY!")
    finally:
        db.close()


if __name__ == "__main__":
    test_allocation_engine()

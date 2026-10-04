"""
Test costing proposals workflow (temporary database review queue & cell-by-cell approval).
"""

from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.project import Project, ProjectCostingItem, ProjectCostingProposal


def test_costing_proposals_workflow():
    db: Session = SessionLocal()
    try:
        p_key = "test_prop_proj"
        # 1. Setup test project
        p = db.query(Project).filter(Project.project_key == p_key).first()
        if not p:
            p = Project(project_key=p_key, name="Proposal Test Tower", code="PROP-01", client="Test Corp")
            db.add(p)
            db.commit()

        # Clean previous test records
        db.query(ProjectCostingProposal).filter(ProjectCostingProposal.project_key == p_key).delete()
        db.query(ProjectCostingItem).filter(ProjectCostingItem.project_key == p_key).delete()
        db.commit()

        # 2. Add an existing live costing item
        live_item = ProjectCostingItem(
            project_key=p_key,
            sl_no=1,
            part_no="SENSOR-ORIG",
            description="Original Sensor",
            qty=10.0,
            purchase_unit_price=100.0,
            purchase_total=1000.0,
            margin=25.0,
            selling_margin_percent=25.0,
            selling_unit_price=125.0,
            selling_total=1250.0,
            vendor="Old Supplier",
            brand="Old Brand",
        )
        db.add(live_item)
        db.commit()
        db.refresh(live_item)
        orig_id = live_item.id

        # 3. Non-admin submits an EDIT proposal to the temporary database
        proposal_edit = ProjectCostingProposal(
            project_key=p_key,
            change_type="EDIT",
            costing_item_id=orig_id,
            proposed_by_name="Engineer Bob",
            proposed_by_role="Project Manager",
            status="pending",
        )
        proposal_edit.original_data = {
            "part_no": live_item.part_no,
            "description": live_item.description,
            "qty": live_item.qty,
            "purchase_unit_price": live_item.purchase_unit_price,
            "margin": live_item.margin,
            "selling_unit_price": live_item.selling_unit_price,
        }
        proposal_edit.proposed_data = {
            "part_no": "SENSOR-MODIFIED",
            "description": "Upgraded Sensor Unit",
            "qty": 15.0,
            "purchase_unit_price": 120.0,
            "margin": 30.0,
            "selling_unit_price": 156.0,
        }
        db.add(proposal_edit)
        db.commit()
        db.refresh(proposal_edit)
        prop_id = proposal_edit.id

        # Verify live item is STILL unchanged in the live DB
        db.refresh(live_item)
        assert live_item.part_no == "SENSOR-ORIG", "Live item must not change before admin approval!"
        assert live_item.qty == 10.0
        print("PASS: Proposal safely isolated in temporary database; live BOM unchanged")

        # 4. Cell-to-cell diff verification
        diff_keys = []
        for k in ["part_no", "description", "qty", "purchase_unit_price", "margin", "selling_unit_price"]:
            if str(proposal_edit.original_data.get(k)) != str(proposal_edit.proposed_data.get(k)):
                diff_keys.append(k)
        assert len(diff_keys) == 6, f"Expected 6 modified cells, got {diff_keys}"
        print(f"PASS: Cell-to-cell comparison identified changed cells: {diff_keys}")

        # 5. Admin Approves the proposal
        from app.api.v1.projects import approve_costing_proposal
        res = approve_costing_proposal(p_key, prop_id, db)
        assert res["message"] == "Proposal approved and applied successfully"

        # Verify live item is now updated
        db.refresh(live_item)
        assert live_item.part_no == "SENSOR-MODIFIED"
        assert live_item.qty == 15.0
        assert live_item.purchase_unit_price == 120.0
        assert live_item.purchase_total == 1800.0  # 15 * 120
        assert live_item.margin == 30.0
        print("PASS: Admin approval updated live costing item with cell modifications")

        # Verify proposal was deleted from temporary database
        prop_check = db.query(ProjectCostingProposal).filter(ProjectCostingProposal.id == prop_id).first()
        assert prop_check is None, "Temporary proposal record must be deleted upon approval!"
        print("PASS: Temporary database cleaned up after approval")

        # 6. Non-admin submits another proposal which Admin rejects
        proposal_rej = ProjectCostingProposal(
            project_key=p_key,
            change_type="ADD",
            proposed_by_name="Site Tech",
            proposed_by_role="Site Supervisor",
            status="pending",
        )
        proposal_rej.proposed_data = {
            "part_no": "EXPENSIVE-PART",
            "description": "Rejected Expensive Sensor",
            "qty": 5.0,
            "purchase_unit_price": 5000.0,
        }
        db.add(proposal_rej)
        db.commit()
        db.refresh(proposal_rej)
        rej_id = proposal_rej.id

        from app.api.v1.projects import reject_costing_proposal
        res_rej = reject_costing_proposal(p_key, rej_id, db)
        assert res_rej["message"] == "Proposal rejected and discarded"

        # Verify rejected proposal deleted from temporary database
        rej_check = db.query(ProjectCostingProposal).filter(ProjectCostingProposal.id == rej_id).first()
        assert rej_check is None, "Rejected proposal must be deleted from temporary database!"
        # Verify no expensive item added to live BOM
        no_item = db.query(ProjectCostingItem).filter(ProjectCostingItem.part_no == "EXPENSIVE-PART").first()
        assert no_item is None
        print("PASS: Admin rejection successfully deleted proposal without altering live BOM")

        # Clean test records
        db.query(ProjectCostingProposal).filter(ProjectCostingProposal.project_key == p_key).delete()
        db.query(ProjectCostingItem).filter(ProjectCostingItem.project_key == p_key).delete()
        db.delete(p)
        db.commit()
        print("\nALL Costing Proposal & Cell-to-Cell Approval tests PASSED!")
    finally:
        db.close()


if __name__ == "__main__":
    test_costing_proposals_workflow()

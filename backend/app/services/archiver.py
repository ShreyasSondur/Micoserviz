import datetime
import logging
from typing import Dict, List, Optional, Union
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.activity_log import ActivityLog
from app.models.project import (
    Project,
    CommercialApprovalStage,
    EngineeringDocumentationStage,
    ProjectCostingItem,
    ProjectProcurementItem,
    ProjectSOAItem,
    ProjectResourceItem,
    ProjectSiteExecutionLog,
)
from app.services.b2_storage import b2_storage
from app.core.pdf_generator import (
    generate_site_execution_pdf_bytes,
    generate_project_dossier_pdf_bytes,
)

logger = logging.getLogger("archiver")
logger.setLevel(logging.INFO)


def _get_target_date(target_date: Optional[Union[datetime.date, datetime.datetime, str]] = None) -> datetime.date:
    if target_date is None:
        return datetime.date.today()
    if isinstance(target_date, str):
        try:
            return datetime.datetime.strptime(target_date[:10], "%Y-%m-%d").date()
        except Exception:
            return datetime.date.today()
    if isinstance(target_date, datetime.datetime):
        return target_date.date()
    return target_date


def archive_daily_activity_logs(
    target_date: Optional[Union[datetime.date, str]] = None,
    db: Optional[Session] = None,
) -> dict:
    """
    Collects all activity logs for target_date and uploads them as JSON to:
    logs/{YYYY}/{MM-MonthName}/{DD}/daily_activity_log.json
    """
    dt = _get_target_date(target_date)
    should_close_db = False
    if db is None:
        db = SessionLocal()
        should_close_db = True

    try:
        start_of_day = datetime.datetime.combine(dt, datetime.time.min)
        end_of_day = datetime.datetime.combine(dt, datetime.time.max)

        logs_query = (
            db.query(ActivityLog)
            .filter(ActivityLog.created_at >= start_of_day, ActivityLog.created_at <= end_of_day)
            .order_by(ActivityLog.created_at.asc())
            .all()
        )

        log_payload = {
            "archive_date": dt.strftime("%Y-%m-%d"),
            "archive_date_formatted": dt.strftime("%d %B %Y"),
            "archived_at": datetime.datetime.utcnow().isoformat(),
            "total_logs": len(logs_query),
            "logs": [
                {
                    "id": l.id,
                    "user": l.user,
                    "project_name": l.project_name,
                    "project_key": l.project_key,
                    "module": l.module,
                    "action": l.action,
                    "timestamp": l.created_at.isoformat() if l.created_at else None,
                    "time_str": l.time_str,
                }
                for l in logs_query
            ],
        }

        b2_key = b2_storage.format_daily_log_key(dt)
        upload_result = b2_storage.upload_json(b2_key, log_payload)

        return {
            "status": "success" if upload_result.get("b2_uploaded") else "fallback_local",
            "date": dt.strftime("%Y-%m-%d"),
            "key": b2_key,
            "total_logs": len(logs_query),
            "b2_result": upload_result,
        }
    except Exception as e:
        logger.error(f"Error archiving daily activity logs for {dt}: {e}")
        return {"status": "error", "date": str(dt), "error": str(e)}
    finally:
        if should_close_db and db:
            db.close()


def archive_daily_site_execution_reports(
    target_date: Optional[Union[datetime.date, str]] = None,
    db: Optional[Session] = None,
) -> dict:
    """
    Finds all active projects with site execution logs on target_date,
    generates their daily PDF reports, and uploads them to:
    logs/{YYYY}/{MM-MonthName}/{DD}/site_execution_reports/Project_{project_key}_Execution_{YYYY-MM-DD}.pdf
    """
    dt = _get_target_date(target_date)
    should_close_db = False
    if db is None:
        db = SessionLocal()
        should_close_db = True

    try:
        date_iso = dt.strftime("%Y-%m-%d")
        date_formatted = dt.strftime("%d %B %Y")
        
        # Match either exact ISO string or timestamp range
        start_of_day = datetime.datetime.combine(dt, datetime.time.min)
        end_of_day = datetime.datetime.combine(dt, datetime.time.max)

        execution_logs = (
            db.query(ProjectSiteExecutionLog)
            .filter(
                (ProjectSiteExecutionLog.date == date_iso)
                | (
                    (ProjectSiteExecutionLog.created_at >= start_of_day)
                    & (ProjectSiteExecutionLog.created_at <= end_of_day)
                )
            )
            .order_by(ProjectSiteExecutionLog.id.asc())
            .all()
        )

        if not execution_logs:
            return {
                "status": "success",
                "date": date_iso,
                "message": f"No site execution logs recorded on {date_iso}.",
                "uploaded_reports": [],
            }

        # Group by project_key
        grouped_logs: Dict[str, List[ProjectSiteExecutionLog]] = {}
        for el in execution_logs:
            pk = el.project_key
            if pk not in grouped_logs:
                grouped_logs[pk] = []
            grouped_logs[pk].append(el)

        uploaded_reports = []
        for pk, p_logs in grouped_logs.items():
            proj = db.query(Project).filter((Project.project_key == pk) | (Project.code == pk)).first()
            proj_name = proj.name if proj else f"Project {pk.upper()}"
            milestone = float(proj.verified_progress_percentage or 0.0) if proj else 0.0

            log_dicts = [
                {
                    "id": l.id,
                    "phase_name": l.phase_name,
                    "supervisor_name": l.supervisor_name,
                    "creator_role": getattr(l, "creator_role", "Site Supervisor"),
                    "description": l.description,
                    "images": l.images,
                    "date": l.date,
                    "created_at": l.created_at.isoformat() if l.created_at else None,
                }
                for l in p_logs
            ]

            pdf_bytes = generate_site_execution_pdf_bytes(
                project_name=proj_name,
                project_key=pk,
                date_str=date_iso,
                formatted_date_label=date_formatted,
                verified_milestone=milestone,
                logs=log_dicts,
            )

            b2_key = b2_storage.format_site_execution_key(pk, dt)
            upload_result = b2_storage.upload_bytes(b2_key, pdf_bytes, content_type="application/pdf")

            uploaded_reports.append({
                "project_key": pk,
                "project_name": proj_name,
                "logs_count": len(p_logs),
                "key": b2_key,
                "size_bytes": len(pdf_bytes),
                "b2_uploaded": upload_result.get("b2_uploaded", False),
            })

        return {
            "status": "success",
            "date": date_iso,
            "total_projects": len(grouped_logs),
            "uploaded_reports": uploaded_reports,
        }
    except Exception as e:
        logger.error(f"Error archiving daily site execution reports for {dt}: {e}")
        return {"status": "error", "date": str(dt), "error": str(e)}
    finally:
        if should_close_db and db:
            db.close()


def sync_project_timeline_dossier(
    project_key: str,
    db: Optional[Session] = None,
) -> dict:
    """
    Generates full master project timeline/dossier PDF from start to end,
    and uploads to Backblaze B2 at: projects/{project_key}/timeline_history.pdf
    overwriting the previous version cleanly.
    """
    should_close_db = False
    if db is None:
        db = SessionLocal()
        should_close_db = True

    try:
        pk = str(project_key).strip()
        proj = db.query(Project).filter((Project.project_key == pk) | (Project.code == pk)).first()
        if not proj and pk.isdigit():
            proj = db.query(Project).filter(Project.id == int(pk)).first()

        if not proj:
            return {"status": "error", "error": f"Project '{project_key}' not found."}

        p_key = proj.project_key

        # 1. Project Info
        project_info = {
            "name": proj.name,
            "client": proj.client,
            "location": proj.location or "United Arab Emirates",
            "code": proj.code,
            "priority": proj.priority,
            "manager": proj.manager,
            "supervisor": proj.supervisor,
            "start_date": proj.start_date,
            "budget": proj.budget,
            "current_stage": proj.current_stage,
            "total_stages": proj.total_stages,
            "verified_progress_percentage": float(proj.verified_progress_percentage or 0.0),
        }

        # 2. Section Statuses
        section_statuses = {
            "commercial": proj.commercial_status or "not_started",
            "engineering": proj.engineering_status or "not_started",
            "budget": proj.budget_status or "not_started",
            "procurement": proj.procurement_status or "not_started",
            "soa": proj.soa_status or "not_started",
            "resource": proj.resource_status or "not_started",
            "site_execution": proj.site_execution_status or "not_started",
            "handover": proj.handover_status or "not_started",
        }

        # 3. Commercial Stages
        comm_stages = (
            db.query(CommercialApprovalStage)
            .filter(CommercialApprovalStage.project_key == p_key)
            .order_by(CommercialApprovalStage.stage_number.asc())
            .all()
        )
        comm_list = [
            {
                "stage_number": cs.stage_number,
                "status": cs.status,
                "po_number": cs.po_number,
                "po_date": cs.po_date,
                "contract_value": cs.contract_value,
                "documents": cs.documents,
            }
            for cs in comm_stages
        ]

        # 4. Engineering Stages
        eng_stages = (
            db.query(EngineeringDocumentationStage)
            .filter(EngineeringDocumentationStage.project_key == p_key)
            .order_by(EngineeringDocumentationStage.stage_number.asc())
            .all()
        )
        eng_list = [
            {
                "stage_number": es.stage_number,
                "status": es.status,
                "documents": es.documents,
            }
            for es in eng_stages
        ]

        # 5. Costing Resources (Manpower)
        res_items = (
            db.query(ProjectResourceItem)
            .filter(ProjectResourceItem.project_key == p_key)
            .order_by(ProjectResourceItem.sl_no.asc())
            .all()
        )
        res_list = [
            {
                "sl_no": r.sl_no,
                "name": r.name,
                "type": r.type,
                "hours_worked": r.hours_worked,
                "date": r.date,
            }
            for r in res_items
        ]

        # 6. Procurement Items
        proc_items = (
            db.query(ProjectProcurementItem)
            .filter(ProjectProcurementItem.project_key == p_key)
            .order_by(ProjectProcurementItem.sl_no.asc())
            .all()
        )
        proc_list = [
            {
                "sl": pi.sl_no,
                "part_no": pi.part_no,
                "product_name": pi.product_name,
                "vendor": pi.vendor,
                "brand": pi.brand,
                "qty": pi.qty,
                "allocated_qty": pi.allocated_qty,
                "status": pi.status,
                "invoice_number": pi.invoice_number,
            }
            for pi in proc_items
        ]

        # 7. SOA Financial Summary
        soa_items = (
            db.query(ProjectSOAItem)
            .filter(ProjectSOAItem.project_key == p_key)
            .order_by(ProjectSOAItem.id.asc())
            .all()
        )
        tot_val = sum(float(item.value or 0.0) for item in soa_items)
        tot_rec = sum(float(item.received or 0.0) for item in soa_items)
        soa_summary = {
            "total_contract": tot_val,
            "received": tot_rec,
            "balance": max(0.0, tot_val - tot_rec),
        }

        # 8. Site Execution Logs
        site_logs = (
            db.query(ProjectSiteExecutionLog)
            .filter(ProjectSiteExecutionLog.project_key == p_key)
            .order_by(ProjectSiteExecutionLog.id.asc())
            .all()
        )
        site_list = [
            {
                "id": sl.id,
                "date": sl.date,
                "supervisor_name": sl.supervisor_name,
                "creator_role": getattr(sl, "creator_role", "Site Supervisor"),
                "phase_name": sl.phase_name,
                "description": sl.description,
                "images": sl.images,
            }
            for sl in site_logs
        ]

        # 9. Activity Logs for this project
        proj_acts = (
            db.query(ActivityLog)
            .filter((ActivityLog.project_key == p_key) | (ActivityLog.project_name == proj.name))
            .order_by(ActivityLog.created_at.desc())
            .limit(50)
            .all()
        )
        act_list = [
            {
                "time": a.time_str,
                "user": a.user,
                "module": a.module,
                "action": a.action,
            }
            for a in proj_acts
        ]

        # Generate Master Dossier PDF
        pdf_bytes = generate_project_dossier_pdf_bytes(
            project_info=project_info,
            section_statuses=section_statuses,
            activity_logs=act_list,
            commercial_stages=comm_list,
            engineering_stages=eng_list,
            costing_resources=res_list,
            procurement_items=proc_list,
            soa_summary=soa_summary,
            site_execution_logs=site_list,
        )

        b2_key = b2_storage.format_project_timeline_key(p_key)
        upload_result = b2_storage.upload_bytes(b2_key, pdf_bytes, content_type="application/pdf")

        return {
            "status": "success" if upload_result.get("b2_uploaded") else "fallback_local",
            "project_key": p_key,
            "project_name": proj.name,
            "key": b2_key,
            "size_bytes": len(pdf_bytes),
            "pdf_bytes": pdf_bytes,
            "b2_uploaded": upload_result.get("b2_uploaded", False),
            "b2_result": upload_result,
        }
    except Exception as e:
        logger.error(f"Error syncing project timeline dossier for {project_key}: {e}")
        return {"status": "error", "project_key": project_key, "error": str(e)}
    finally:
        if should_close_db and db:
            db.close()


def archive_all_daily_data(
    target_date: Optional[Union[datetime.date, str]] = None,
    db: Optional[Session] = None,
) -> dict:
    """Combines daily activity log archiving and daily site execution reports archiving."""
    dt = _get_target_date(target_date)
    logs_res = archive_daily_activity_logs(dt, db=db)
    reports_res = archive_daily_site_execution_reports(dt, db=db)
    return {
        "status": "completed",
        "date": dt.strftime("%Y-%m-%d"),
        "activity_logs_archive": logs_res,
        "site_execution_archive": reports_res,
    }

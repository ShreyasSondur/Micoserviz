from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.manpower import router as manpower_router
from app.api.v1.invoices import router as invoices_router
from app.api.v1.inventory import router as inventory_router
from app.api.v1.projects import router as projects_router
from app.api.v1.cashflow import router as cashflow_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.logs import router as logs_router

api_v1_router = APIRouter()
api_v1_router.include_router(auth_router)
api_v1_router.include_router(users_router)
api_v1_router.include_router(manpower_router)
api_v1_router.include_router(invoices_router)
api_v1_router.include_router(inventory_router)
api_v1_router.include_router(projects_router)
api_v1_router.include_router(cashflow_router)
api_v1_router.include_router(tasks_router)
api_v1_router.include_router(logs_router)


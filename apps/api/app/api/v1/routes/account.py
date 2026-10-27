from fastapi import APIRouter, Depends, Response, status

from app.api.deps import CurrentUser, get_current_user
from app.core.config import settings

router = APIRouter(tags=["account"])


@router.get("/me")
async def get_me(user: CurrentUser = Depends(get_current_user)):
    """Return current user profile, plan, limits and active feature flags."""
    return {
        "id": user.id,
        "email": user.email,
        "plan": "free",
        "limits": {
            "daily_token_budget": settings.DAILY_TOKEN_BUDGET,
            "steps_per_minute": settings.STEPS_PER_MINUTE,
            "reviews_per_minute": settings.REVIEWS_PER_MINUTE,
            "max_messages": settings.MAX_MESSAGES,
            "max_schedules": settings.MAX_SCHEDULES,
        },
        "flags": {},
    }


@router.delete("/me/data", status_code=status.HTTP_204_NO_CONTENT)
async def delete_me_data(user: CurrentUser = Depends(get_current_user)):
    """Cascade delete all data belonging to the user."""
    # In M1, returns 204. In later DB integration, cascades via foreign key on auth.uid()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me/export")
async def export_me_data(user: CurrentUser = Depends(get_current_user)):
    """Export all user sessions and shortcuts as JSON."""
    return {
        "user_id": user.id,
        "sessions": [],
        "shortcuts": [],
    }

"""
Audit logging utilities
"""
from typing import Optional
from sqlmodel import Session
from backend.models import AuditLog


def log_event(
    session: Session,
    event_type: str,
    user_id: Optional[int] = None,
    admin_id: Optional[int] = None,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    ip: Optional[str] = None
) -> AuditLog:
    """Create an audit log entry"""
    audit_log = AuditLog(
        event_type=event_type,
        user_id=user_id,
        admin_id=admin_id,
        old_value=old_value,
        new_value=new_value,
        ip=ip
    )
    session.add(audit_log)
    session.commit()
    session.refresh(audit_log)
    return audit_log


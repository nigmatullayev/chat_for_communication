"""
Group chat endpoints
"""
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlmodel import Session, select, func, delete
import os
from PIL import Image
import aiofiles
from backend.config import settings

from backend.database import get_session
from backend.models import User, Group, GroupMember, GroupMessage, GroupMessageReaction
from backend.schemas import (
    GroupCreate, GroupUpdate, GroupResponse, GroupMemberResponse,
    GroupMessageCreate, GroupMessageUpdate, GroupMessageResponse,
    GroupMessageReactionCreate, GroupMessageReactionResponse
)
from backend.auth import get_current_user

router = APIRouter()


@router.post("/", response_model=GroupResponse)
async def create_group(
    group_data: GroupCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Create a new group"""
    # Create group
    group = Group(
        name=group_data.name,
        description=group_data.description,
        created_by=current_user.id
    )
    session.add(group)
    session.commit()
    session.refresh(group)
    
    # Add creator as admin
    creator_member = GroupMember(
        group_id=group.id,
        user_id=current_user.id,
        role="admin"
    )
    session.add(creator_member)
    
    # Add other members
    member_ids = set(group_data.member_ids)
    member_ids.discard(current_user.id)  # Remove creator if present
    
    for user_id in member_ids:
        user = session.get(User, user_id)
        if user and user.is_active:
            member = GroupMember(
                group_id=group.id,
                user_id=user_id,
                role="member"
            )
            session.add(member)
    
    session.commit()
    session.refresh(group)
    
    # Get member count
    member_count = session.exec(
        select(func.count(GroupMember.id)).where(GroupMember.group_id == group.id)
    ).one()
    
    # Get creator member to check role
    creator_member = session.exec(
        select(GroupMember).where(
            GroupMember.group_id == group.id,
            GroupMember.user_id == current_user.id
        )
    ).first()
    
    group_dict = {
        "id": group.id,
        "name": group.name,
        "description": group.description,
        "avatar": group.avatar,
        "created_by": group.created_by,
        "created_at": group.created_at,
        "updated_at": group.updated_at,
        "member_count": member_count,
        "is_owner": True,
        "is_admin": True,
        "user_role": "admin"
    }
    
    return group_dict


@router.get("/", response_model=List[GroupResponse])
async def get_my_groups(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get all groups the current user is a member of"""
    # Get groups where user is a member
    groups = session.exec(
        select(Group).join(GroupMember).where(GroupMember.user_id == current_user.id)
    ).all()
    
    result = []
    for group in groups:
        member_count = session.exec(
            select(func.count(GroupMember.id)).where(GroupMember.group_id == group.id)
        ).one()
        
        # Get user's member record
        user_member = session.exec(
            select(GroupMember).where(
                GroupMember.group_id == group.id,
                GroupMember.user_id == current_user.id
            )
        ).first()
        
        is_owner = group.created_by == current_user.id
        is_admin = user_member.role == "admin" if user_member else False
        
        result.append({
            "id": group.id,
            "name": group.name,
            "description": group.description,
            "avatar": group.avatar,
            "created_by": group.created_by,
            "created_at": group.created_at,
            "updated_at": group.updated_at,
            "member_count": member_count,
            "is_owner": is_owner,
            "is_admin": is_admin,
            "user_role": user_member.role if user_member else None
        })
    
    return result


@router.get("/{group_id}", response_model=GroupResponse)
async def get_group(
    group_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get group details"""
    group = session.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check if user is a member
    member = session.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id
        )
    ).first()
    
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this group")
    
    member_count = session.exec(
        select(func.count(GroupMember.id)).where(GroupMember.group_id == group_id)
    ).one()
    
    # Check if user is owner
    is_owner = group.created_by == current_user.id
    is_admin = member.role == "admin"
    
    return {
        "id": group.id,
        "name": group.name,
        "description": group.description,
        "avatar": group.avatar,
        "created_by": group.created_by,
        "created_at": group.created_at,
        "updated_at": group.updated_at,
        "member_count": member_count,
        "is_owner": is_owner,
        "is_admin": is_admin,
        "user_role": member.role
    }


@router.put("/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: int,
    group_update: GroupUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Update group details (only owner or admin)"""
    group = session.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check if user is admin or owner
    member = session.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id
        )
    ).first()
    
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this group")
    
    is_owner = group.created_by == current_user.id
    is_admin = member.role == "admin"
    
    if not is_owner and not is_admin:
        raise HTTPException(status_code=403, detail="Only owner or admins can update group")
    
    if group_update.name:
        group.name = group_update.name
    if group_update.description is not None:
        group.description = group_update.description
    
    group.updated_at = datetime.now(timezone.utc)
    session.add(group)
    session.commit()
    session.refresh(group)
    
    member_count = session.exec(
        select(func.count(GroupMember.id)).where(GroupMember.group_id == group_id)
    ).one()
    
    is_owner = group.created_by == current_user.id
    is_admin = member.role == "admin" if member else False
    
    return {
        "id": group.id,
        "name": group.name,
        "description": group.description,
        "avatar": group.avatar,
        "created_by": group.created_by,
        "created_at": group.created_at,
        "updated_at": group.updated_at,
        "member_count": member_count,
        "is_owner": is_owner,
        "is_admin": is_admin,
        "user_role": member.role if member else None
    }


@router.post("/{group_id}/avatar", response_model=GroupResponse)
async def upload_group_avatar(
    group_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Upload group avatar (only owner or admin)"""
    import os
    from PIL import Image
    import aiofiles
    from backend.config import settings
    
    group = session.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check if user is admin or owner
    member = session.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id
        )
    ).first()
    
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this group")
    
    is_owner = group.created_by == current_user.id
    is_admin = member.role == "admin"
    
    if not is_owner and not is_admin:
        raise HTTPException(status_code=403, detail="Only owner or admins can upload group avatar")
    
    # Validate file
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in settings.allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed: {', '.join(settings.allowed_extensions)}"
        )
    
    # Create uploads directory if it doesn't exist
    os.makedirs(settings.upload_dir, exist_ok=True)
    
    # Read file content
    content = await file.read()
    if len(content) > settings.max_upload_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Max size: {settings.max_upload_size / 1024 / 1024}MB"
        )
    
    # Process and save image
    filename = f"group_{group_id}_{datetime.now().timestamp()}{file_ext}"
    filepath = os.path.join(settings.upload_dir, filename)
    
    # Save original
    async with aiofiles.open(filepath, 'wb') as f:
        await f.write(content)
    
    # Create thumbnail
    try:
        image = Image.open(filepath)
        image.thumbnail((256, 256), Image.Resampling.LANCZOS)
        thumb_filename = f"thumb_{filename}"
        thumb_filepath = os.path.join(settings.upload_dir, thumb_filename)
        image.save(thumb_filepath, optimize=True, quality=85)
        group.avatar = thumb_filename
    except Exception as e:
        # If image processing fails, use original
        group.avatar = filename
    
    group.updated_at = datetime.now(timezone.utc)
    session.add(group)
    session.commit()
    session.refresh(group)
    
    member_count = session.exec(
        select(func.count(GroupMember.id)).where(GroupMember.group_id == group_id)
    ).one()
    
    is_owner = group.created_by == current_user.id
    is_admin = member.role == "admin" if member else False
    
    return {
        "id": group.id,
        "name": group.name,
        "description": group.description,
        "avatar": group.avatar,
        "created_by": group.created_by,
        "created_at": group.created_at,
        "updated_at": group.updated_at,
        "member_count": member_count,
        "is_owner": is_owner,
        "is_admin": is_admin,
        "user_role": member.role if member else None
    }


@router.get("/{group_id}/members", response_model=List[GroupMemberResponse])
async def get_group_members(
    group_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get all members of a group"""
    # Check if user is a member
    member = session.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id
        )
    ).first()
    
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this group")
    
    # Get all members
    members = session.exec(
        select(GroupMember).where(GroupMember.group_id == group_id)
    ).all()
    
    result = []
    for mem in members:
        user = session.get(User, mem.user_id)
        if user:
            result.append({
                "id": mem.id,
                "group_id": mem.group_id,
                "user_id": mem.user_id,
                "role": mem.role,
                "joined_at": mem.joined_at,
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "profile_pic": user.profile_pic,
                    "is_active": user.is_active
                }
            })
    
    return result


@router.post("/{group_id}/members", response_model=GroupMemberResponse)
async def add_group_member(
    group_id: int,
    user_id: int = Query(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Add a member to the group (only owner or admin)"""
    group = session.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check if current user is admin or owner
    member = session.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id
        )
    ).first()
    
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this group")
    
    is_owner = group.created_by == current_user.id
    is_admin = member.role == "admin"
    
    if not is_owner and not is_admin:
        raise HTTPException(status_code=403, detail="Only owner or admins can add members")
    
    # Check if user exists and is active
    user = session.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Check if user is already a member
    existing = session.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == user_id
        )
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="User is already a member")
    
    # Add member
    new_member = GroupMember(
        group_id=group_id,
        user_id=user_id,
        role="member"
    )
    session.add(new_member)
    session.commit()
    session.refresh(new_member)
    
    return {
        "id": new_member.id,
        "group_id": new_member.group_id,
        "user_id": new_member.user_id,
        "role": new_member.role,
        "joined_at": new_member.joined_at,
        "user": {
            "id": user.id,
            "username": user.username,
            "profile_pic": user.profile_pic,
            "is_active": user.is_active
        }
    }


@router.delete("/{group_id}/members/{user_id}")
async def remove_group_member(
    group_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Remove a member from the group (only admin or owner)"""
    group = session.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check if current user is admin or owner
    member = session.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id
        )
    ).first()
    
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this group")
    
    # Only owner or admin can remove members (owner can remove anyone, admin can remove regular members)
    is_owner = group.created_by == current_user.id
    is_admin = member.role == "admin"
    
    if not is_owner and not is_admin:
        raise HTTPException(status_code=403, detail="Only admins or owner can remove members")
    
    # Find the member to remove
    member_to_remove = session.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == user_id
        )
    ).first()
    
    if not member_to_remove:
        raise HTTPException(status_code=404, detail="Member not found")
    
    # Don't allow removing the owner
    if group.created_by == user_id:
        raise HTTPException(status_code=403, detail="Cannot remove group owner")
    
    # Admin cannot remove other admins (only owner can)
    if member_to_remove.role == "admin" and not is_owner:
        raise HTTPException(status_code=403, detail="Only owner can remove admins")
    
    session.delete(member_to_remove)
    session.commit()
    
    return {"message": "Member removed successfully"}


@router.post("/{group_id}/leave")
async def leave_group(
    group_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Leave a group (cannot leave if you're the owner)"""
    group = session.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Cannot leave if you're the owner
    if group.created_by == current_user.id:
        raise HTTPException(status_code=403, detail="Group owner cannot leave the group. Transfer ownership or delete the group instead.")
    
    # Find the member
    member = session.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id
        )
    ).first()
    
    if not member:
        raise HTTPException(status_code=404, detail="You are not a member of this group")
    
    session.delete(member)
    session.commit()
    
    return {"message": "Left group successfully"}


@router.delete("/{group_id}")
async def delete_group(
    group_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Delete a group (only owner)"""
    group = session.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Only owner can delete group
    if group.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only group owner can delete the group")
    
    # Delete all reactions first (need to get message IDs first)
    messages = session.exec(
        select(GroupMessage).where(GroupMessage.group_id == group_id)
    ).all()
    
    message_ids = [msg.id for msg in messages]
    if message_ids:
        reactions = session.exec(
            select(GroupMessageReaction).where(GroupMessageReaction.message_id.in_(message_ids))
        ).all()
        for reaction in reactions:
            session.delete(reaction)
    
    # Delete all messages
    for message in messages:
        session.delete(message)
    
    # Delete all members
    members = session.exec(
        select(GroupMember).where(GroupMember.group_id == group_id)
    ).all()
    for member in members:
        session.delete(member)
    
    # Delete group
    session.delete(group)
    session.commit()
    
    return {"message": "Group deleted successfully"}


@router.patch("/{group_id}/members/{user_id}/role")
async def change_member_role(
    group_id: int,
    user_id: int,
    role: str = Query(..., description="New role: 'admin' or 'member'"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Change member role (only owner can promote/demote admins)"""
    if role not in ["admin", "member"]:
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'member'")
    
    group = session.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Only owner can change roles
    if group.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Only group owner can change member roles")
    
    # Cannot change owner's role
    if user_id == group.created_by:
        raise HTTPException(status_code=403, detail="Cannot change owner's role")
    
    # Find the member
    member = session.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == user_id
        )
    ).first()
    
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    
    member.role = role
    session.add(member)
    session.commit()
    session.refresh(member)
    
    user = session.get(User, user_id)
    
    return {
        "id": member.id,
        "group_id": member.group_id,
        "user_id": member.user_id,
        "role": member.role,
        "joined_at": member.joined_at,
        "user": {
            "id": user.id,
            "username": user.username,
            "profile_pic": user.profile_pic,
            "is_active": user.is_active
        }
    }


@router.get("/{group_id}/messages", response_model=List[GroupMessageResponse])
async def get_group_messages(
    group_id: int,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get group messages"""
    # Check if user is a member
    member = session.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id
        )
    ).first()
    
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this group")
    
    # Get messages
    messages = session.exec(
        select(GroupMessage)
        .where(GroupMessage.group_id == group_id, GroupMessage.is_deleted == False)
        .order_by(GroupMessage.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    
    result = []
    for msg in messages:
        sender = session.get(User, msg.sender_id)
        if sender:
            # Get reactions
            reactions = session.exec(
                select(GroupMessageReaction).where(GroupMessageReaction.message_id == msg.id)
            ).all()
            
            reaction_list = []
            for reaction in reactions:
                user = session.get(User, reaction.user_id)
                if user:
                    reaction_list.append({
                        "id": reaction.id,
                        "message_id": reaction.message_id,
                        "user_id": reaction.user_id,
                        "reaction_type": reaction.reaction_type,
                        "created_at": reaction.created_at,
                        "user": {
                            "id": user.id,
                            "username": user.username,
                            "profile_pic": user.profile_pic,
                            "is_active": user.is_active
                        }
                    })
            
            result.append({
                "id": msg.id,
                "group_id": msg.group_id,
                "sender_id": msg.sender_id,
                "content": msg.content,
                "attachment": msg.attachment,
                "message_type": msg.message_type,
                "location_lat": msg.location_lat,
                "location_lng": msg.location_lng,
                "is_deleted": msg.is_deleted,
                "edited_at": msg.edited_at,
                "created_at": msg.created_at,
                "sender": {
                    "id": sender.id,
                    "username": sender.username,
                    "profile_pic": sender.profile_pic,
                    "is_active": sender.is_active
                },
                "reactions": reaction_list
            })
    
    # Return in chronological order
    return list(reversed(result))


@router.post("/{group_id}/messages", response_model=GroupMessageResponse)
async def create_group_message(
    group_id: int,
    message_data: GroupMessageCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Send a message to the group"""
    # Check if user is a member
    member = session.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id
        )
    ).first()
    
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this group")
    
    # Create message
    message = GroupMessage(
        group_id=group_id,
        sender_id=current_user.id,
        content=message_data.content,
        attachment=message_data.attachment,
        message_type=message_data.message_type,
        location_lat=message_data.location_lat,
        location_lng=message_data.location_lng
    )
    session.add(message)
    session.commit()
    session.refresh(message)
    
    # Update group updated_at
    group = session.get(Group, group_id)
    if group:
        group.updated_at = datetime.now(timezone.utc)
        session.add(group)
        session.commit()
    
    sender = session.get(User, current_user.id)
    
    return {
        "id": message.id,
        "group_id": message.group_id,
        "sender_id": message.sender_id,
        "content": message.content,
        "attachment": message.attachment,
        "message_type": message.message_type,
        "location_lat": message.location_lat,
        "location_lng": message.location_lng,
        "is_deleted": message.is_deleted,
        "edited_at": message.edited_at,
        "created_at": message.created_at,
        "sender": {
            "id": sender.id,
            "username": sender.username,
            "profile_pic": sender.profile_pic,
            "is_active": sender.is_active
        },
        "reactions": []
    }


@router.put("/{group_id}/messages/{message_id}", response_model=GroupMessageResponse)
async def update_group_message(
    group_id: int,
    message_id: int,
    message_update: GroupMessageUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Update a group message (only sender)"""
    message = session.get(GroupMessage, message_id)
    if not message or message.group_id != group_id:
        raise HTTPException(status_code=404, detail="Message not found")
    
    if message.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own messages")
    
    if message_update.content:
        message.content = message_update.content
        message.edited_at = datetime.now(timezone.utc)
    
    session.add(message)
    session.commit()
    session.refresh(message)
    
    sender = session.get(User, message.sender_id)
    
    # Get reactions
    reactions = session.exec(
        select(GroupMessageReaction).where(GroupMessageReaction.message_id == message_id)
    ).all()
    
    reaction_list = []
    for reaction in reactions:
        user = session.get(User, reaction.user_id)
        if user:
            reaction_list.append({
                "id": reaction.id,
                "message_id": reaction.message_id,
                "user_id": reaction.user_id,
                "reaction_type": reaction.reaction_type,
                "created_at": reaction.created_at,
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "profile_pic": user.profile_pic,
                    "is_active": user.is_active
                }
            })
    
    return {
        "id": message.id,
        "group_id": message.group_id,
        "sender_id": message.sender_id,
        "content": message.content,
        "attachment": message.attachment,
        "message_type": message.message_type,
        "location_lat": message.location_lat,
        "location_lng": message.location_lng,
        "is_deleted": message.is_deleted,
        "edited_at": message.edited_at,
        "created_at": message.created_at,
        "sender": {
            "id": sender.id,
            "username": sender.username,
            "profile_pic": sender.profile_pic,
            "is_active": sender.is_active
        },
        "reactions": reaction_list
    }


@router.delete("/{group_id}/messages/{message_id}")
async def delete_group_message(
    group_id: int,
    message_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Delete a group message (only sender)"""
    message = session.get(GroupMessage, message_id)
    if not message or message.group_id != group_id:
        raise HTTPException(status_code=404, detail="Message not found")
    
    if message.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own messages")
    
    message.is_deleted = True
    session.add(message)
    session.commit()
    
    return {"message": "Message deleted successfully"}


@router.post("/{group_id}/messages/{message_id}/reactions", response_model=GroupMessageReactionResponse)
async def add_group_message_reaction(
    group_id: int,
    message_id: int,
    reaction: GroupMessageReactionCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Add a reaction to a group message"""
    message = session.get(GroupMessage, message_id)
    if not message or message.group_id != group_id:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Check if user is a member
    member = session.exec(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id
        )
    ).first()
    
    if not member:
        raise HTTPException(status_code=403, detail="You are not a member of this group")
    
    # Check if reaction already exists
    existing = session.exec(
        select(GroupMessageReaction).where(
            GroupMessageReaction.message_id == message_id,
            GroupMessageReaction.user_id == current_user.id,
            GroupMessageReaction.reaction_type == reaction.reaction_type
        )
    ).first()
    
    if existing:
        # Remove existing reaction (toggle)
        session.delete(existing)
        session.commit()
        raise HTTPException(status_code=200, detail="Reaction removed")
    
    # Add reaction
    new_reaction = GroupMessageReaction(
        message_id=message_id,
        user_id=current_user.id,
        reaction_type=reaction.reaction_type
    )
    session.add(new_reaction)
    session.commit()
    session.refresh(new_reaction)
    
    user = session.get(User, current_user.id)
    
    return {
        "id": new_reaction.id,
        "message_id": new_reaction.message_id,
        "user_id": new_reaction.user_id,
        "reaction_type": new_reaction.reaction_type,
        "created_at": new_reaction.created_at,
        "user": {
            "id": user.id,
            "username": user.username,
            "profile_pic": user.profile_pic,
            "is_active": user.is_active
        }
    }


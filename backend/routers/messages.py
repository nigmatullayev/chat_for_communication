"""
Messages and WebSocket endpoints
"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query, HTTPException, status, UploadFile, File
from sqlmodel import Session, select

from backend.database import get_session
from backend.models import User, Message, MessageReaction
from backend.schemas import MessageResponse, MessageCreate, MessageUpdate, MessageReactionCreate, MessageReactionResponse
from backend.auth import get_current_user, decode_token
from backend.config import settings
import os
import aiofiles

router = APIRouter()


@router.get("/conversations", response_model=List[dict])
async def get_conversations(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get list of conversations (chats) for current user"""
    from sqlmodel import func, desc
    
    # Get all unique users the current user has messaged with
    sent_messages = select(
        Message.receiver_id,
        func.max(Message.created_at).label('last_message_time')
    ).where(
        Message.sender_id == current_user.id,
        Message.is_deleted == False
    ).group_by(Message.receiver_id)
    
    received_messages = select(
        Message.sender_id,
        func.max(Message.created_at).label('last_message_time')
    ).where(
        Message.receiver_id == current_user.id,
        Message.is_deleted == False
    ).group_by(Message.sender_id)
    
    # Get the latest message for each conversation
    conversations = []
    user_ids = set()
    
    # Get sent messages
    for msg in session.exec(
        select(Message).where(Message.sender_id == current_user.id, Message.is_deleted == False)
        .order_by(Message.created_at.desc())
    ).all():
        if msg.receiver_id not in user_ids:
            user_ids.add(msg.receiver_id)
            other_user = session.get(User, msg.receiver_id)
            if other_user:
                conversations.append({
                    "user_id": other_user.id,
                    "username": other_user.username,
                    "profile_pic": other_user.profile_pic,
                    "first_name": other_user.first_name,
                    "last_name": other_user.last_name,
                    "last_message": msg.content or ("📎 Media" if msg.attachment else ""),
                    "last_message_time": msg.created_at.isoformat(),
                    "unread_count": 0
                })
    
    # Get received messages
    for msg in session.exec(
        select(Message).where(Message.receiver_id == current_user.id, Message.is_deleted == False)
        .order_by(Message.created_at.desc())
    ).all():
        if msg.sender_id not in user_ids:
            user_ids.add(msg.sender_id)
            other_user = session.get(User, msg.sender_id)
            if other_user:
                unread = session.exec(
                    select(func.count(Message.id)).where(
                        Message.sender_id == msg.sender_id,
                        Message.receiver_id == current_user.id,
                        Message.is_read == False,
                        Message.is_deleted == False
                    )
                ).one()
                conversations.append({
                    "user_id": other_user.id,
                    "username": other_user.username,
                    "profile_pic": other_user.profile_pic,
                    "first_name": other_user.first_name,
                    "last_name": other_user.last_name,
                    "last_message": msg.content or ("📎 Media" if msg.attachment else ""),
                    "last_message_time": msg.created_at.isoformat(),
                    "unread_count": unread
                })
    
    # Sort by last message time
    conversations.sort(key=lambda x: x['last_message_time'], reverse=True)
    
    return conversations


@router.get("/{user_id}", response_model=List[MessageResponse])
async def get_chat_history(
    user_id: int,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Get chat history between current user and another user"""
    # Verify the other user exists
    other_user = session.get(User, user_id)
    if not other_user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )
    
    # Get messages in both directions (exclude deleted)
    from sqlmodel import or_, and_
    query = select(Message).where(
        and_(
            or_(
                and_(Message.sender_id == current_user.id, Message.receiver_id == user_id),
                and_(Message.sender_id == user_id, Message.receiver_id == current_user.id)
            ),
            Message.is_deleted == False
        )
    ).order_by(Message.created_at.desc()).limit(limit).offset(offset)
    
    messages = session.exec(query).all()
    
    # Mark messages as read
    for msg in messages:
        if msg.receiver_id == current_user.id and not msg.is_read:
            msg.is_read = True
            session.add(msg)
    
    session.commit()
    
    # Load reactions for messages
    message_ids = [msg.id for msg in messages]
    if message_ids:
        reactions = session.exec(
            select(MessageReaction).where(MessageReaction.message_id.in_(message_ids))
        ).all()
        
        # Group reactions by message_id
        reactions_by_message = {}
        for reaction in reactions:
            if reaction.message_id not in reactions_by_message:
                reactions_by_message[reaction.message_id] = []
            reactions_by_message[reaction.message_id].append(reaction)
        
        # Attach reactions to messages
        for msg in messages:
            msg.reactions = reactions_by_message.get(msg.id, [])
    
    # Return in chronological order
    return list(reversed(messages))


@router.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: int,
    token: str = Query(...)
):
    """WebSocket endpoint for real-time messaging and signaling"""
    await websocket.accept()
    
    try:
        # Authenticate user
        payload = decode_token(token)
        if payload.get("type") != "access":
            await websocket.close(code=1008, reason="Invalid token type")
            return
        
        # Get user from database
        from backend.database import engine
        with Session(engine) as session:
            user = session.exec(
                select(User).where(User.username == payload.get("sub"))
            ).first()
            
            if not user or not user.is_active or user.id != user_id:
                await websocket.close(code=1008, reason="Unauthorized")
                return
            
            # Store connection
            from backend.websocket_manager import manager
            manager.connect(user_id, websocket)
            
            # Send connection confirmation
            await websocket.send_json({
                "type": "connected",
                "user_id": user_id
            })
            
            # Handle incoming messages
            try:
                while True:
                    data = await websocket.receive_json()
                    await manager.handle_message(user_id, data, session)
                    
            except WebSocketDisconnect:
                manager.disconnect(user_id)
                
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.close(code=1011, reason="Internal server error")


@router.put("/{message_id}", response_model=MessageResponse)
async def update_message(
    message_id: int,
    message_update: MessageUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Update a message (only sender can update)"""
    message = session.get(Message, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    if message.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own messages")
    
    if message.is_deleted:
        raise HTTPException(status_code=400, detail="Cannot edit deleted message")
    
    if message_update.content is not None:
        message.content = message_update.content
        message.edited_at = datetime.utcnow()
    
    session.add(message)
    session.commit()
    session.refresh(message)
    
    return message


@router.delete("/{message_id}")
async def delete_message(
    message_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Delete a message (soft delete - only sender can delete)"""
    message = session.get(Message, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    if message.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own messages")
    
    message.is_deleted = True
    session.add(message)
    session.commit()
    
    return {"message": "Message deleted successfully"}


@router.post("/{message_id}/reactions", response_model=MessageReactionResponse)
async def add_reaction(
    message_id: int,
    reaction: MessageReactionCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Add or update reaction to a message"""
    message = session.get(Message, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Check if user already reacted
    existing_reaction = session.exec(
        select(MessageReaction).where(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == current_user.id
        )
    ).first()
    
    if existing_reaction:
        # Update existing reaction
        existing_reaction.reaction_type = reaction.reaction_type
        session.add(existing_reaction)
        session.commit()
        session.refresh(existing_reaction)
        return existing_reaction
    else:
        # Create new reaction
        new_reaction = MessageReaction(
            message_id=message_id,
            user_id=current_user.id,
            reaction_type=reaction.reaction_type
        )
        session.add(new_reaction)
        session.commit()
        session.refresh(new_reaction)
        return new_reaction


@router.delete("/{message_id}/reactions")
async def remove_reaction(
    message_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    """Remove reaction from a message"""
    reaction = session.exec(
        select(MessageReaction).where(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == current_user.id
        )
    ).first()
    
    if not reaction:
        raise HTTPException(status_code=404, detail="Reaction not found")
    
    session.delete(reaction)
    session.commit()
    
    return {"message": "Reaction removed successfully"}


@router.post("/upload")
async def upload_message_media(
    file: UploadFile = File(...),
    message_type: str = Query("image"),  # image, video, circular_video
    current_user: User = Depends(get_current_user)
):
    """Upload media file for messages (image, video, circular video)"""
    
    # Validate file type
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    if message_type == "image":
        if file_ext not in settings.allowed_image_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid image type. Allowed: {', '.join(settings.allowed_image_extensions)}"
            )
    elif message_type in ["video", "circular_video"]:
        if file_ext not in settings.allowed_video_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid video type. Allowed: {', '.join(settings.allowed_video_extensions)}"
            )
    else:
        raise HTTPException(status_code=400, detail="Invalid message_type")
    
    # Create uploads directory if it doesn't exist
    os.makedirs(settings.upload_dir, exist_ok=True)
    
    # Read file content
    content = await file.read()
    if len(content) > settings.max_upload_size:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Max size: {settings.max_upload_size / 1024 / 1024}MB"
        )
    
    # Save file
    filename = f"msg_{current_user.id}_{datetime.now().timestamp()}{file_ext}"
    filepath = os.path.join(settings.upload_dir, filename)
    
    async with aiofiles.open(filepath, 'wb') as f:
        await f.write(content)
    
    return {"filename": filename, "url": f"/uploads/{filename}"}


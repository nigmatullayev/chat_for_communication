"""
WebSocket connection manager
"""
from typing import Dict
from datetime import datetime, timezone
from fastapi import WebSocket, WebSocketDisconnect
from sqlmodel import Session, select

from backend.models import Message, User, MessageReaction


class ConnectionManager:
    """Manages WebSocket connections"""
    
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}
    
    def connect(self, user_id: int, websocket: WebSocket):
        """Add a new connection"""
        if user_id in self.active_connections:
            # Disconnect old connection
            try:
                self.active_connections[user_id].close()
            except:
                pass
        self.active_connections[user_id] = websocket
        print(f"User {user_id} connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, user_id: int):
        """Remove a connection"""
        if user_id in self.active_connections:
            del self.active_connections[user_id]
            print(f"User {user_id} disconnected. Total connections: {len(self.active_connections)}")
    
    async def send_personal_message(self, message: dict, user_id: int):
        """Send message to specific user"""
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_json(message)
            except Exception as e:
                print(f"Error sending message to user {user_id}: {e}")
                self.disconnect(user_id)
    
    async def handle_message(self, sender_id: int, data: dict, session: Session):
        """Handle incoming WebSocket message"""
        msg_type = data.get("type")
        
        if msg_type == "message":
            # Handle chat message
            receiver_id = data.get("to")
            content = data.get("content")
            attachment = data.get("attachment")
            message_type = data.get("message_type", "text")
            location_lat = data.get("location_lat")
            location_lng = data.get("location_lng")
            reply_to_message_id = data.get("reply_to_message_id")
            
            if not receiver_id:
                return
            
            # Create message in database
            message = Message(
                sender_id=sender_id,
                receiver_id=receiver_id,
                content=content,
                attachment=attachment,
                message_type=message_type,
                location_lat=location_lat,
                location_lng=location_lng,
                reply_to_message_id=reply_to_message_id
            )
            session.add(message)
            session.commit()
            session.refresh(message)
            
            # Get sender info
            sender = session.get(User, sender_id)
            
            # Load reply_to message if exists
            reply_to_data = None
            if reply_to_message_id:
                reply_to_msg = session.get(Message, reply_to_message_id)
                if reply_to_msg:
                    reply_to_sender = session.get(User, reply_to_msg.sender_id)
                    reply_to_data = {
                        "id": reply_to_msg.id,
                        "content": reply_to_msg.content,
                        "attachment": reply_to_msg.attachment,
                        "message_type": reply_to_msg.message_type,
                        "sender": {
                            "id": reply_to_sender.id if reply_to_sender else None,
                            "username": reply_to_sender.username if reply_to_sender else "Unknown",
                            "first_name": reply_to_sender.first_name if reply_to_sender else None
                        }
                    }
                else:
                    # If message not found in DB, use reply_to data from frontend if provided
                    frontend_reply_to = data.get("reply_to")
                    if frontend_reply_to:
                        reply_to_data = frontend_reply_to
            else:
                # No reply_to_message_id, but check if reply_to data was sent from frontend
                frontend_reply_to = data.get("reply_to")
                if frontend_reply_to:
                    reply_to_data = frontend_reply_to
            
            # Prepare message data
            message_data = {
                "type": "message",
                "id": message.id,
                "from": sender_id,
                "sender_id": sender_id,
                "receiver_id": receiver_id,
                "content": content,
                "attachment": attachment,
                "message_type": message_type,
                "location_lat": location_lat,
                "location_lng": location_lng,
                "reply_to_message_id": reply_to_message_id,
                "reply_to": reply_to_data,
                "sender": {
                    "id": sender.id,
                    "username": sender.username,
                    "profile_pic": sender.profile_pic,
                    "first_name": sender.first_name,
                    "last_name": sender.last_name
                },
                "created_at": message.created_at.isoformat(),
                "timestamp": message.created_at.isoformat(),
                "is_read": message.is_read,
                "read_at": message.read_at.isoformat() if message.read_at else None
            }
            
            # Include temp_id if provided
            if "temp_id" in data:
                message_data["temp_id"] = data["temp_id"]
            
            # Send to receiver if online
            await self.send_personal_message(message_data, receiver_id)
            
            # Also send back to sender so they see their own message in real-time
            # Include temp_id if provided to match with optimistic message
            if "temp_id" in data:
                message_data["temp_id"] = data["temp_id"]
            await self.send_personal_message(message_data, sender_id)
        
        elif msg_type == "call_request":
            # Handle call request (new protocol - caller requests call before sending offer)
            receiver_id = data.get("to")
            call_type = data.get("call_type", "video")  # Get call type, default to video
            
            if not receiver_id:
                return
            
            # Get caller info
            caller = session.get(User, sender_id)
            
            # Send call request to receiver
            await self.send_personal_message({
                "type": "call_request",
                "from": sender_id,
                "call_type": call_type,
                "caller": {
                    "id": caller.id,
                    "username": caller.username,
                    "profile_pic": caller.profile_pic,
                    "first_name": caller.first_name,
                    "last_name": caller.last_name
                }
            }, receiver_id)
        
        elif msg_type == "call_accept":
            # Handle call accept (receiver accepts call request)
            receiver_id = data.get("to")  # This is the caller ID
            
            if not receiver_id:
                return
            
            # Notify caller that call was accepted
            await self.send_personal_message({
                "type": "call_accept",
                "from": sender_id
            }, receiver_id)
        
        elif msg_type == "call_reject":
            # Handle call reject (receiver rejects call request)
            receiver_id = data.get("to")  # This is the caller ID
            
            if not receiver_id:
                return
            
            # Notify caller that call was rejected
            await self.send_personal_message({
                "type": "call_reject",
                "from": sender_id
            }, receiver_id)
        
        elif msg_type == "incoming_call":
            # Handle incoming call signaling (offer after call accepted)
            receiver_id = data.get("to")
            sdp = data.get("sdp")
            call_type = data.get("call_type", "video")  # Get call type, default to video
            
            if not receiver_id or not sdp:
                return
            
            # Get caller info
            caller = session.get(User, sender_id)
            
            # Send call invitation to receiver
            await self.send_personal_message({
                "type": "incoming_call",
                "from": sender_id,
                "call_type": call_type,  # Include call type
                "caller": {
                    "id": caller.id,
                    "username": caller.username,
                    "profile_pic": caller.profile_pic,
                    "first_name": caller.first_name,
                    "last_name": caller.last_name
                },
                "sdp": sdp
            }, receiver_id)
        
        elif msg_type == "call_answer":
            # Handle call answer
            receiver_id = data.get("to")
            sdp = data.get("sdp")
            
            if not receiver_id or not sdp:
                return
            
            # Send answer to caller
            await self.send_personal_message({
                "type": "call_answer",
                "from": sender_id,
                "sdp": sdp
            }, receiver_id)
        
        elif msg_type == "ice_candidate":
            # Handle ICE candidate
            receiver_id = data.get("to")
            candidate = data.get("candidate")
            
            if not receiver_id or not candidate:
                return
            
            # Forward ICE candidate
            await self.send_personal_message({
                "type": "ice_candidate",
                "from": sender_id,
                "candidate": candidate
            }, receiver_id)
        
        elif msg_type == "call_end":
            # Handle call end
            receiver_id = data.get("to")
            
            if not receiver_id:
                return
            
            # Notify receiver
            await self.send_personal_message({
                "type": "call_end",
                "from": sender_id
            }, receiver_id)
        
        elif msg_type == "typing":
            # Handle typing indicator
            receiver_id = data.get("to")
            
            if not receiver_id:
                return
            
            # Send typing indicator
            await self.send_personal_message({
                "type": "typing",
                "from": sender_id
            }, receiver_id)
        
        elif msg_type == "add_reaction":
            # Handle reaction add/update
            message_id = data.get("message_id")
            reaction_type = data.get("reaction_type")
            
            if not message_id or not reaction_type:
                return
            
            # Get message to find receiver
            message = session.get(Message, message_id)
            if not message:
                return
            
            # Check if user can react (message must be in conversation with sender)
            if message.sender_id != sender_id and message.receiver_id != sender_id:
                return
            
            # Get or create reaction
            from backend.models import MessageReaction
            existing_reaction = session.exec(
                select(MessageReaction).where(
                    MessageReaction.message_id == message_id,
                    MessageReaction.user_id == sender_id
                )
            ).first()
            
            if existing_reaction:
                # If same reaction type, remove it (toggle behavior)
                if existing_reaction.reaction_type == reaction_type:
                    session.delete(existing_reaction)
                else:
                    # Update to new reaction type
                    existing_reaction.reaction_type = reaction_type
                    session.add(existing_reaction)
            else:
                # Create new reaction
                new_reaction = MessageReaction(
                    message_id=message_id,
                    user_id=sender_id,
                    reaction_type=reaction_type
                )
                session.add(new_reaction)
            
            session.commit()
            session.refresh(message)
            
            # Get all reactions for this message
            reactions = session.exec(
                select(MessageReaction).where(MessageReaction.message_id == message_id)
            ).all()
            
            # Get user info for reactions
            reaction_data = []
            for reaction in reactions:
                user = session.get(User, reaction.user_id)
                reaction_data.append({
                    "id": reaction.id,
                    "user_id": reaction.user_id,
                    "reaction_type": reaction.reaction_type,
                    "user": {
                        "id": user.id,
                        "username": user.username,
                        "profile_pic": user.profile_pic
                    }
                })
            
            # Send to both sender and receiver
            receiver_id = message.receiver_id if message.sender_id == sender_id else message.sender_id
            
            reaction_update = {
                "type": "reaction_update",
                "message_id": message_id,
                "reactions": reaction_data,
                "from": sender_id,
                "sender_id": message.sender_id,
                "receiver_id": message.receiver_id
            }
            
            await self.send_personal_message(reaction_update, receiver_id)
            await self.send_personal_message(reaction_update, sender_id)
        
        elif msg_type == "remove_reaction":
            # Handle reaction removal
            message_id = data.get("message_id")
            
            if not message_id:
                return
            
            # Get message
            message = session.get(Message, message_id)
            if not message:
                return
            
            # Check if user can remove reaction
            if message.sender_id != sender_id and message.receiver_id != sender_id:
                return
            
            # Remove reaction
            from backend.models import MessageReaction
            reaction = session.exec(
                select(MessageReaction).where(
                    MessageReaction.message_id == message_id,
                    MessageReaction.user_id == sender_id
                )
            ).first()
            
            if reaction:
                session.delete(reaction)
                session.commit()
                
                # Get updated reactions
                reactions = session.exec(
                    select(MessageReaction).where(MessageReaction.message_id == message_id)
                ).all()
                
                # Get user info for reactions
                reaction_data = []
                for r in reactions:
                    user = session.get(User, r.user_id)
                    reaction_data.append({
                        "id": r.id,
                        "user_id": r.user_id,
                        "reaction_type": r.reaction_type,
                        "user": {
                            "id": user.id,
                            "username": user.username,
                            "profile_pic": user.profile_pic
                        }
                    })
                
                # Send to both sender and receiver
                receiver_id = message.receiver_id if message.sender_id == sender_id else message.sender_id
                
                reaction_update = {
                    "type": "reaction_update",
                    "message_id": message_id,
                    "reactions": reaction_data,
                    "from": sender_id,
                    "sender_id": message.sender_id,
                    "receiver_id": message.receiver_id
                }
                
                await self.send_personal_message(reaction_update, receiver_id)
                await self.send_personal_message(reaction_update, sender_id)
        
        elif msg_type == "edit_message":
            # Handle message edit
            message_id = data.get("message_id")
            new_content = data.get("content")
            
            if not message_id or not new_content:
                return
            
            # Get message
            message = session.get(Message, message_id)
            if not message:
                return
            
            # Check if user can edit (only sender can edit)
            if message.sender_id != sender_id:
                return
            
            if message.is_deleted:
                return
            
            # Update message
            message.content = new_content
            message.edited_at = datetime.now(timezone.utc)
            session.add(message)
            session.commit()
            session.refresh(message)
            
            # Get sender info
            sender = session.get(User, sender_id)
            
            # Prepare updated message data
            message_update = {
                "type": "message_edited",
                "message_id": message_id,
                "content": new_content,
                "edited_at": message.edited_at.isoformat(),
                "sender_id": message.sender_id,
                "receiver_id": message.receiver_id,
                "from": sender_id,
                "sender": {
                    "id": sender.id,
                    "username": sender.username,
                    "profile_pic": sender.profile_pic
                }
            }
            
            # Send to both sender and receiver
            await self.send_personal_message(message_update, message.receiver_id)
            await self.send_personal_message(message_update, message.sender_id)
        
        elif msg_type == "delete_message":
            # Handle message delete
            message_id = data.get("message_id")
            
            if not message_id:
                return
            
            # Get message
            message = session.get(Message, message_id)
            if not message:
                return
            
            # Check if user can delete (only sender can delete)
            if message.sender_id != sender_id:
                return
            
            if message.is_deleted:
                return
            
            # Mark message as deleted (soft delete)
            message.is_deleted = True
            session.add(message)
            session.commit()
            session.refresh(message)
            
            # Get sender info
            sender = session.get(User, sender_id)
            
            # Prepare delete message data
            delete_update = {
                "type": "message_deleted",
                "message_id": message_id,
                "sender_id": message.sender_id,
                "receiver_id": message.receiver_id,
                "from": sender_id,
                "sender": {
                    "id": sender.id,
                    "username": sender.username,
                    "profile_pic": sender.profile_pic
                }
            }
            
            # Send to both sender and receiver
            await self.send_personal_message(delete_update, message.receiver_id)
            await self.send_personal_message(delete_update, message.sender_id)
        
        elif msg_type == "mark_read":
            # Handle marking messages as read
            message_ids = data.get("message_ids", [])
            user_id = data.get("user_id")  # The user whose messages should be marked as read
            
            print(f"🔔 mark_read received: sender_id={sender_id}, user_id={user_id}, message_ids={message_ids}")
            
            if not message_ids or not user_id:
                print(f"⚠️ mark_read: Missing message_ids or user_id")
                return
            
            # Get messages that belong to this user and are received by sender
            read_timestamp = datetime.now(timezone.utc)
            read_message_ids = []
            
            for msg_id in message_ids:
                message = session.get(Message, msg_id)
                if message:
                    print(f"📨 Checking message {msg_id}: receiver_id={message.receiver_id}, sender_id={message.sender_id}, is_read={message.is_read}")
                    # Check if message belongs to this conversation
                    if message.receiver_id == sender_id and message.sender_id == user_id:
                        # Only update read_at when marking as read for the first time
                        if not message.is_read:
                            message.is_read = True
                            message.read_at = read_timestamp
                            session.add(message)
                            read_message_ids.append(msg_id)
                        elif message.is_read and not message.read_at:
                            # If message is marked as read but read_at is missing, set it
                            message.read_at = read_timestamp
                            session.add(message)
                            read_message_ids.append(msg_id)
                else:
                    print(f"⚠️ Message {msg_id} not found in database")
            
            if read_message_ids:
                session.commit()
                print(f"💾 Committed {len(read_message_ids)} read status updates")
                
                # Send read status update to sender (the one who sent the messages)
                read_update = {
                    "type": "messages_read",
                    "message_ids": read_message_ids,
                    "read_at": read_timestamp.isoformat(),
                    "reader_id": sender_id
                }
                
                print(f"📤 Sending messages_read to user_id={user_id}: {read_update}")
                await self.send_personal_message(read_update, user_id)
            else:
                print(f"⚠️ No messages to mark as read")


manager = ConnectionManager()


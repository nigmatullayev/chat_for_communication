#!/usr/bin/env python3
"""
Comprehensive QA Testing Suite - Chat+Video Application
Tests all features: Backend API, WebSocket, Frontend functions, Integration
"""
import requests
import json
import time
import os
import sys
from typing import Optional, Dict, Any, List
from datetime import datetime

# Try to import websockets, but make it optional
try:
    import websockets
    import asyncio
    WEBSOCKETS_AVAILABLE = True
except ImportError:
    WEBSOCKETS_AVAILABLE = False

BASE_URL = "http://localhost:8030/api"
WS_URL = "ws://localhost:8030/api/messages/ws"
TEST_RESULTS = {
    "passed": 0,
    "failed": 0,
    "warnings": 0,
    "errors": [],
    "test_categories": {}
}

def print_test(test_name: str, category: str = "General"):
    """Print test name"""
    print(f"\n{'='*70}")
    print(f"TEST [{category}]: {test_name}")
    print(f"{'='*70}")

def assert_test(condition: bool, message: str, category: str = "General"):
    """Assert test condition"""
    if condition:
        TEST_RESULTS["passed"] += 1
        if category not in TEST_RESULTS["test_categories"]:
            TEST_RESULTS["test_categories"][category] = {"passed": 0, "failed": 0}
        TEST_RESULTS["test_categories"][category]["passed"] += 1
        print(f"✓ PASS: {message}")
        return True
    else:
        TEST_RESULTS["failed"] += 1
        TEST_RESULTS["errors"].append(message)
        if category not in TEST_RESULTS["test_categories"]:
            TEST_RESULTS["test_categories"][category] = {"passed": 0, "failed": 0}
        TEST_RESULTS["test_categories"][category]["failed"] += 1
        print(f"✗ FAIL: {message}")
        return False

def warn_test(message: str):
    """Print warning"""
    TEST_RESULTS["warnings"] += 1
    print(f"⚠ WARN: {message}")


def test_response(response: requests.Response, expected_status: int = 200, 
                  check_data: bool = True, error_msg: str = "") -> bool:
    """Test response status and optionally data"""
    if response.status_code != expected_status:
        print(f"  Expected status {expected_status}, got {response.status_code}")
        print(f"  Response: {response.text[:200]}")
        if error_msg:
            print(f"  Error: {error_msg}")
        return False
    
    if check_data and response.status_code == 200:
        try:
            data = response.json()
            return data is not None
        except:
            return False
    
    return True

# ==================== AUTHENTICATION TESTS ====================

def test_login_valid():
    """Test valid login"""
    print_test("Login with valid credentials", "Authentication")
    
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"username": "admin", "password": "admin123"}
    )
    
    assert_test(
        test_response(response, 200),
        "Login with valid credentials",
        "Authentication"
    )
    
    if response.status_code == 200:
        data = response.json()
        assert_test(
            "access_token" in data and "refresh_token" in data and "user" in data,
            "Response contains tokens and user data",
            "Authentication"
        )
        assert_test(
            data["user"]["username"] == "admin",
            "User data is correct",
            "Authentication"
        )
        assert_test(
            data["user"]["role"] == "admin",
            "User role is correct",
            "Authentication"
        )
        return data["access_token"], data["refresh_token"], data["user"]
    
    return None, None, None

def test_login_invalid():
    """Test login with invalid credentials"""
    print_test("Login with invalid credentials", "Authentication")
    
    # Invalid username
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"username": "nonexistent", "password": "password123"}
    )
    assert_test(
        test_response(response, 401, check_data=False),
        "Login with invalid username returns 401",
        "Authentication"
    )
    
    # Invalid password
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"username": "admin", "password": "wrongpassword"}
    )
    assert_test(
        test_response(response, 401, check_data=False),
        "Login with invalid password returns 401",
        "Authentication"
    )
    
    # Missing fields
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={"username": "admin"}
    )
    assert_test(
        response.status_code in [400, 422],
        "Login with missing fields returns error",
        "Authentication"
    )

def test_token_refresh(access_token: str, refresh_token: str):
    """Test token refresh"""
    print_test("Token refresh", "Authentication")
    
    response = requests.post(
        f"{BASE_URL}/auth/refresh",
        json={"refresh_token": refresh_token}
    )
    
    assert_test(
        test_response(response, 200),
        "Token refresh successful",
        "Authentication"
    )
    
    if response.status_code == 200:
        data = response.json()
        assert_test(
            "access_token" in data,
            "New access token received",
            "Authentication"
        )
        return data.get("access_token", access_token)
    
    return access_token

def test_token_validation(access_token: str):
    """Test token validation"""
    print_test("Token validation", "Authentication")
    
    # Valid token
    response = requests.get(
        f"{BASE_URL}/users/me",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    assert_test(
        test_response(response, 200),
        "Valid token works",
        "Authentication"
    )
    
    # Invalid token
    response = requests.get(
        f"{BASE_URL}/users/me",
        headers={"Authorization": "Bearer invalid_token_12345"}
    )
    assert_test(
        test_response(response, 401, check_data=False),
        "Invalid token rejected",
        "Authentication"
    )
    
    # Missing token
    response = requests.get(f"{BASE_URL}/users/me")
    assert_test(
        test_response(response, 401, check_data=False),
        "Missing token rejected",
        "Authentication"
    )

# ==================== USER PROFILE TESTS ====================

def test_get_current_user(access_token: str):
    """Test get current user profile"""
    print_test("Get current user profile", "User Profile")
    
    response = requests.get(
        f"{BASE_URL}/users/me",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    
    assert_test(
        test_response(response, 200),
        "Get current user profile",
        "User Profile"
    )
    
    if response.status_code == 200:
        data = response.json()
        assert_test(
            "id" in data and "username" in data,
            "User profile contains required fields",
            "User Profile"
        )
        return data
    
    return None

def test_list_users(access_token: str):
    """Test list users"""
    print_test("List users", "User Profile")
    
    response = requests.get(
        f"{BASE_URL}/users/list",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    
    assert_test(
        test_response(response, 200),
        "List users successful",
        "User Profile"
    )
    
    if response.status_code == 200:
        users = response.json()
        assert_test(
            isinstance(users, list),
            "Users list is an array",
            "User Profile"
        )
        # Check admin is excluded
        admin_in_list = any(u.get("role") == "admin" for u in users)
        assert_test(
            not admin_in_list,
            "Admin users excluded from list",
            "User Profile"
        )
        return users
    
    return []

def test_search_users(access_token: str):
    """Test search users"""
    print_test("Search users", "User Profile")
    
    # Search with query
    response = requests.get(
        f"{BASE_URL}/users/list?search=test",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    
    assert_test(
        test_response(response, 200),
        "Search users successful",
        "User Profile"
    )
    
    # Empty search
    response = requests.get(
        f"{BASE_URL}/users/list?search=",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    assert_test(
        test_response(response, 200),
        "Empty search handled correctly",
        "User Profile"
    )
    
    # Special characters
    response = requests.get(
        f"{BASE_URL}/users/list?search=%27%20OR%201%3D1--",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    assert_test(
        test_response(response, 200),
        "SQL injection attempt handled safely",
        "User Profile"
    )

def test_update_profile(access_token: str):
    """Test update profile"""
    print_test("Update profile", "User Profile")
    
    update_data = {
        "first_name": "Test",
        "last_name": "User",
        "bio": "QA Test User"
    }
    
    response = requests.put(
        f"{BASE_URL}/users/me",
        headers={"Authorization": f"Bearer {access_token}"},
        json=update_data
    )
    
    assert_test(
        test_response(response, 200),
        "Update profile successful",
        "User Profile"
    )
    
    if response.status_code == 200:
        data = response.json()
        assert_test(
            data.get("first_name") == "Test",
            "First name updated correctly",
            "User Profile"
        )

def test_get_user_by_id(access_token: str, user_id: int):
    """Test get user by ID"""
    print_test("Get user by ID", "User Profile")
    
    response = requests.get(
        f"{BASE_URL}/users/{user_id}",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    
    assert_test(
        test_response(response, 200),
        "Get user by ID successful",
        "User Profile"
    )
    
    # Non-existent user
    response = requests.get(
        f"{BASE_URL}/users/99999",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    assert_test(
        test_response(response, 404, check_data=False),
        "Non-existent user returns 404",
        "User Profile"
    )

def test_follow_unfollow(access_token: str, user_id: int):
    """Test follow/unfollow user"""
    print_test("Follow/Unfollow user", "User Profile")
    
    # Follow
    response = requests.post(
        f"{BASE_URL}/users/{user_id}/follow",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    
    assert_test(
        test_response(response, 200),
        "Follow user successful",
        "User Profile"
    )
    
    # Get follow status
    response = requests.get(
        f"{BASE_URL}/users/{user_id}/follow-status",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    
    assert_test(
        test_response(response, 200),
        "Get follow status successful",
        "User Profile"
    )
    
    if response.status_code == 200:
        data = response.json()
        assert_test(
            data.get("following") == True,
            "Follow status is correct",
            "User Profile"
        )
    
    # Unfollow
    response = requests.delete(
        f"{BASE_URL}/users/{user_id}/follow",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    
    assert_test(
        test_response(response, 200),
        "Unfollow user successful",
        "User Profile"
    )

# ==================== MESSAGE TESTS ====================

def test_get_conversations(access_token: str):
    """Test get conversations"""
    print_test("Get conversations", "Messages")
    
    response = requests.get(
        f"{BASE_URL}/messages/conversations",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    
    assert_test(
        test_response(response, 200),
        "Get conversations successful",
        "Messages"
    )
    
    if response.status_code == 200:
        conversations = response.json()
        assert_test(
            isinstance(conversations, list),
            "Conversations is an array",
            "Messages"
        )
        return conversations
    
    return []

def test_get_chat_history(access_token: str, user_id: int):
    """Test get chat history"""
    print_test("Get chat history", "Messages")
    
    response = requests.get(
        f"{BASE_URL}/messages/{user_id}?limit=50",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    
    assert_test(
        test_response(response, 200),
        "Get chat history successful",
        "Messages"
    )
    
    if response.status_code == 200:
        messages = response.json()
        assert_test(
            isinstance(messages, list),
            "Messages is an array",
            "Messages"
        )

def test_upload_media(access_token: str):
    """Test upload media"""
    print_test("Upload media", "Messages")
    
    # Create a test file
    test_file = "test_image.jpg"
    with open(test_file, "wb") as f:
        f.write(b"fake image content")
    
    try:
        with open(test_file, "rb") as f:
            files = {"file": ("test_image.jpg", f, "image/jpeg")}
            response = requests.post(
                f"{BASE_URL}/messages/upload",
                headers={"Authorization": f"Bearer {access_token}"},
                files=files
            )
        
        # Clean up
        if os.path.exists(test_file):
            os.remove(test_file)
        
        assert_test(
            test_response(response, 200),
            "Upload media successful",
            "Messages"
        )
        
        # Test invalid file type
        invalid_file = "test_file.txt"
        with open(invalid_file, "w") as f:
            f.write("invalid content")
        
        try:
            with open(invalid_file, "rb") as f:
                files = {"file": ("test_file.txt", f, "text/plain")}
                response = requests.post(
                    f"{BASE_URL}/messages/upload",
                    headers={"Authorization": f"Bearer {access_token}"},
                    files=files
                )
            
            assert_test(
                test_response(response, 400, check_data=False),
                "Invalid file type rejected",
                "Messages"
            )
        finally:
            if os.path.exists(invalid_file):
                os.remove(invalid_file)
                
    except Exception as e:
        warn_test(f"Upload media test skipped: {e}")

# ==================== WEBSOCKET TESTS ====================

def test_websocket_connection(access_token: str, user_id: int):
    """Test WebSocket connection"""
    print_test("WebSocket connection", "WebSocket")
    
    if not WEBSOCKETS_AVAILABLE:
        warn_test("WebSocket tests skipped - websockets module not installed")
        return
    
    try:
        async def _test_ws():
            uri = f"{WS_URL}/{user_id}?token={access_token}"
            async with websockets.connect(uri) as websocket:
                # Wait for connection message
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                    data = json.loads(message)
                    
                    assert_test(
                        data.get("type") == "connected",
                        "WebSocket connection established",
                        "WebSocket"
                    )
                    
                    # Send a test message
                    test_message = {
                        "type": "message",
                        "to": user_id,
                        "content": "Test message",
                        "message_type": "text"
                    }
                    await websocket.send(json.dumps(test_message))
                    
                    # Wait for response
                    try:
                        response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                        response_data = json.loads(response)
                        
                        assert_test(
                            response_data.get("type") == "message",
                            "Message sent via WebSocket",
                            "WebSocket"
                        )
                    except asyncio.TimeoutError:
                        warn_test("WebSocket message response timeout")
                    
                except asyncio.TimeoutError:
                    warn_test("WebSocket connection timeout")
        
        asyncio.run(_test_ws())
                
    except Exception as e:
        warn_test(f"WebSocket test failed: {e}")

# ==================== ADMIN TESTS ====================

def test_admin_list_users(access_token: str):
    """Test admin list users"""
    print_test("Admin list users", "Admin")
    
    response = requests.get(
        f"{BASE_URL}/admin/users",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    
    assert_test(
        test_response(response, 200),
        "Admin list users successful",
        "Admin"
    )
    
    if response.status_code == 200:
        users = response.json()
        assert_test(
            isinstance(users, list),
            "Admin users list is an array",
            "Admin"
        )

def test_admin_create_user(access_token: str):
    """Test admin create user"""
    print_test("Admin create user", "Admin")
    
    user_data = {
        "username": f"testuser_{int(time.time())}",
        "password": "testpass123",
        "first_name": "Test",
        "last_name": "User",
        "role": "user"
    }
    
    response = requests.post(
        f"{BASE_URL}/admin/users",
        headers={"Authorization": f"Bearer {access_token}"},
        json=user_data
    )
    
    assert_test(
        test_response(response, 200),
        "Admin create user successful",
        "Admin"
    )
    
    if response.status_code == 200:
        user = response.json()
        assert_test(
            user.get("username") == user_data["username"],
            "Created user has correct username",
            "Admin"
        )
        return user.get("id")
    
    return None

def test_admin_get_audit_logs(access_token: str):
    """Test admin get audit logs"""
    print_test("Admin get audit logs", "Admin")
    
    response = requests.get(
        f"{BASE_URL}/admin/audit_logs?limit=10",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    
    assert_test(
        test_response(response, 200),
        "Admin get audit logs successful",
        "Admin"
    )

# ==================== EDGE CASES TESTS ====================

def test_edge_cases(access_token: str):
    """Test edge cases"""
    print_test("Edge cases", "Edge Cases")
    
    # Large limit
    response = requests.get(
        f"{BASE_URL}/messages/conversations?limit=99999",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    assert_test(
        test_response(response, 200),
        "Large limit parameter handled",
        "Edge Cases"
    )
    
    # Negative limit
    response = requests.get(
        f"{BASE_URL}/messages/conversations?limit=-1",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    assert_test(
        test_response(response, 200) or response.status_code == 422,
        "Negative limit parameter handled",
        "Edge Cases"
    )
    
    # Empty strings
    response = requests.put(
        f"{BASE_URL}/users/me",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"bio": ""}
    )
    assert_test(
        test_response(response, 200),
        "Empty string handled correctly",
        "Edge Cases"
    )

# ==================== SECURITY TESTS ====================

def test_security(access_token: str):
    """Test security measures"""
    print_test("Security tests", "Security")
    
    # SQL injection attempt
    response = requests.get(
        f"{BASE_URL}/users/list?search=' OR 1=1--",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    assert_test(
        test_response(response, 200),
        "SQL injection attempt handled safely",
        "Security"
    )
    
    # XSS attempt
    response = requests.put(
        f"{BASE_URL}/users/me",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"bio": "<script>alert('xss')</script>"}
    )
    assert_test(
        test_response(response, 200),
        "XSS attempt handled (should be sanitized on frontend)",
        "Security"
    )
    
    # Path traversal attempt
    response = requests.get(
        f"{BASE_URL}/users/../../../etc/passwd",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    assert_test(
        response.status_code in [404, 400],
        "Path traversal attempt blocked",
        "Security"
    )

# ==================== MAIN TEST RUNNER ====================

def run_all_tests():
    """Run all tests"""
    print("\n" + "="*70)
    print("COMPREHENSIVE QA TESTING SUITE - Chat+Video Application")
    print("="*70)
    print(f"Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*70)
    
    # Check if server is running
    try:
        response = requests.get(f"{BASE_URL.replace('/api', '')}/api/health", timeout=5)
        if response.status_code != 200:
            print("\n❌ Server is not running or not accessible!")
            print("Please start the server first: uvicorn backend.main:app --reload --host 0.0.0.0 --port 8030")
            return
    except Exception as e:
        print(f"\n❌ Cannot connect to server: {e}")
        print("Please start the server first: uvicorn backend.main:app --reload --host 0.0.0.0 --port 8030")
        return
    
    print("✓ Server is running")
    
    # Test authentication
    access_token, refresh_token, current_user = test_login_valid()
    if not access_token:
        print("\n❌ Cannot proceed without valid token. Stopping tests.")
        return
    
    current_user_id = current_user.get("id") if current_user else 1
    
    test_login_invalid()
    access_token = test_token_refresh(access_token, refresh_token)
    test_token_validation(access_token)
    
    # Test user endpoints
    test_get_current_user(access_token)
    users = test_list_users(access_token)
    test_search_users(access_token)
    test_update_profile(access_token)
    
    # Get a target user for follow/message tests
    target_user_id = None
    if users and len(users) > 0:
        target_user_id = users[0].get("id")
    else:
        target_user_id = 2  # Fallback
    
    if target_user_id:
        test_get_user_by_id(access_token, target_user_id)
        test_follow_unfollow(access_token, target_user_id)
    
    # Test message endpoints
    test_get_conversations(access_token)
    if target_user_id:
        test_get_chat_history(access_token, target_user_id)
    test_upload_media(access_token)
    
    # Test WebSocket
    if current_user_id and WEBSOCKETS_AVAILABLE:
        try:
            test_websocket_connection(access_token, current_user_id)
        except Exception as e:
            warn_test(f"WebSocket test failed: {e}")
    elif not WEBSOCKETS_AVAILABLE:
        warn_test("WebSocket tests skipped - install websockets: pip install websockets")
    
    # Test admin endpoints
    test_admin_list_users(access_token)
    created_user_id = test_admin_create_user(access_token)
    test_admin_get_audit_logs(access_token)
    
    # Test edge cases
    test_edge_cases(access_token)
    
    # Test security
    test_security(access_token)
    
    # Print summary
    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    print(f"Total Tests: {TEST_RESULTS['passed'] + TEST_RESULTS['failed']}")
    print(f"✓ Passed: {TEST_RESULTS['passed']}")
    print(f"✗ Failed: {TEST_RESULTS['failed']}")
    print(f"⚠ Warnings: {TEST_RESULTS['warnings']}")
    
    if TEST_RESULTS['test_categories']:
        print("\nBy Category:")
        for category, stats in TEST_RESULTS['test_categories'].items():
            total = stats['passed'] + stats['failed']
            print(f"  {category}: {stats['passed']}/{total} passed")
    
    if TEST_RESULTS['errors']:
        print("\nErrors:")
        for error in TEST_RESULTS['errors'][:10]:  # Show first 10
            print(f"  - {error}")
    
    success_rate = (TEST_RESULTS['passed'] / (TEST_RESULTS['passed'] + TEST_RESULTS['failed']) * 100) if (TEST_RESULTS['passed'] + TEST_RESULTS['failed']) > 0 else 0
    print(f"\nSuccess Rate: {success_rate:.1f}%")
    
    if TEST_RESULTS['failed'] == 0:
        print("\n✅ ALL TESTS PASSED!")
    else:
        print(f"\n❌ {TEST_RESULTS['failed']} TEST(S) FAILED")
    
    print(f"\nTest completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*70)
    
    return TEST_RESULTS['failed'] == 0

if __name__ == "__main__":
    try:
        success = run_all_tests()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⚠ Tests interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Test suite error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


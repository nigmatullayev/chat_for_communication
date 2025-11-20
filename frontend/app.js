// Chat+Video v1 - Frontend JavaScript

const API_BASE = '/api';
let currentUser = null;
let accessToken = null;
let refreshToken = null;
let wsConnection = null;
let currentChatUserId = null;
let currentGroupId = null;
let editingGroupMessageId = null;
let reactingGroupMessageId = null;
let groupPendingMedia = { type: null, file: null, location: null };
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let isCallActive = false;
let currentVideoDeviceId = null;
let availableVideoDevices = [];
let isScreenSharing = false;
let screenShareStream = null;
let isOnHold = false;
let currentCallType = null; // 'video' or 'audio'
let pendingMedia = { type: null, file: null, url: null, location: null };
let editingMessageId = null;
let reactingMessageId = null;
let isLoggedOut = false;
let pendingTimeouts = [];
let abortControllers = [];
let pendingMessages = new Map(); // Track pending optimistic messages
let messageIdCounter = 0; // For temporary message IDs

// WebRTC Configuration
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

// Initialize audio context on user interaction (required for autoplay policy)
let audioContextInitialized = false;
function initializeAudioContext() {
    if (audioContextInitialized) return;
    
    // Try to resume any suspended audio context
    if (window.incomingCallAudioContext && window.incomingCallAudioContext.state === 'suspended') {
        window.incomingCallAudioContext.resume().then(() => {
            console.log('Audio context resumed');
        }).catch(e => {
            console.log('Could not resume audio context:', e);
        });
    }
    
    audioContextInitialized = true;
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
    
    // Initialize audio context on first user interaction
    ['click', 'touchstart', 'keydown'].forEach(eventType => {
        document.addEventListener(eventType, initializeAudioContext, { once: true });
    });
});

// Check authentication
function checkAuth() {
    const token = localStorage.getItem('accessToken');
    if (token) {
        isLoggedOut = false; // Reset logout flag if token exists
        accessToken = token;
        refreshToken = localStorage.getItem('refreshToken');
        // Load user profile, but handle 401 errors gracefully
        loadUserProfile().catch(error => {
            console.error('Error loading user profile:', error);
            // If token is invalid, clear it and show login
            if (error.status === 401 || error.message?.includes('401')) {
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                accessToken = null;
                refreshToken = null;
                isLoggedOut = true;
                showLoginScreen();
            }
        });
    } else {
        isLoggedOut = true; // Set logout flag if no token
        showLoginScreen();
    }
}

// Setup event listeners
function setupEventListeners() {
    // Login
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    
    // Logout - handle both desktop and mobile
    // Multiple approaches to ensure logout works
    const setupLogoutButton = () => {
        // Direct event listener on logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            // Remove any existing listeners by cloning
            const newLogoutBtn = logoutBtn.cloneNode(true);
            logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
            
            newLogoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Logout button clicked (direct)');
                handleLogout();
            });
        }
        
        // Also handle by class
        document.querySelectorAll('.nav-item.logout').forEach(btn => {
            if (btn.id !== 'logoutBtn') {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Logout button clicked (by class)');
                    handleLogout();
                });
            }
        });
    };
    
    // Setup immediately
    setupLogoutButton();
    
    // Also use event delegation as backup - check for icon, span, or button itself
    document.addEventListener('click', (e) => {
        // Check if clicked element or its parent is logout button
        const target = e.target;
        let logoutBtn = null;
        
        // Check if target itself is logout button
        if (target.id === 'logoutBtn' || target.classList.contains('logout')) {
            logoutBtn = target;
        }
        // Check if target is inside logout button (icon, span, etc.)
        else if (target.closest('#logoutBtn')) {
            logoutBtn = document.getElementById('logoutBtn');
        }
        // Check if target is inside any logout button by class
        else if (target.closest('.nav-item.logout')) {
            logoutBtn = target.closest('.nav-item.logout');
        }
        // Check if parent is logout button
        else if (target.parentElement && (target.parentElement.id === 'logoutBtn' || target.parentElement.classList.contains('logout'))) {
            logoutBtn = target.parentElement;
        }
        
        if (logoutBtn) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Logout button clicked (delegation)', { target: target.tagName, logoutBtn: logoutBtn.id || logoutBtn.className });
            handleLogout();
            return false;
        }
    }, true); // Use capture phase to catch early
    
    // Navigation - Handle both mobile and desktop nav
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const view = e.currentTarget.dataset.view;
            if (view) {
                switchView(view);
            }
        });
    });
    
    // Also handle desktop nav menu items
    document.querySelectorAll('.desktop-nav-menu .nav-item[data-view]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const view = e.currentTarget.dataset.view;
            if (view) {
                switchView(view);
            }
        });
    });
    
    // Handle mobile bottom nav items
    document.querySelectorAll('.mobile-bottom-nav .nav-item[data-view]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const view = e.currentTarget.dataset.view;
            if (view) {
                switchView(view);
            }
        });
    });
    
    // Back buttons
    document.getElementById('backFromChat')?.addEventListener('click', () => {
        switchView('chat');
    });
    document.getElementById('backFromUserProfile')?.addEventListener('click', () => {
        switchView('search');
    });
    
    // Profile - Settings button (in header)
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            switchView('settings');
        });
    }
    
    // Settings - Logout button (mobile responsive)
    const settingsLogoutBtn = document.getElementById('settingsLogoutBtn');
    if (settingsLogoutBtn) {
        settingsLogoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Settings logout button clicked');
            handleLogout();
        });
    }
    
    // Group chat - Back button
    document.getElementById('backFromGroupChat')?.addEventListener('click', () => {
        document.getElementById('groupChatView').classList.add('hidden');
        switchView('chat');
        switchChatTab('groups');
    });
    
    // Group chat - Send button
    document.getElementById('groupSendBtn')?.addEventListener('click', sendGroupMessage);
    
    // Group chat - Message input Enter key
    document.getElementById('groupMessageInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendGroupMessage();
        }
    });
    
    // Group chat - Media attachments
    document.getElementById('groupAttachImageBtn')?.addEventListener('click', () => {
        document.getElementById('groupImageInput').click();
    });
    
    document.getElementById('groupImageInput')?.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleGroupImageSelect(e.target.files[0]);
        }
    });
    
    document.getElementById('groupAttachVideoBtn')?.addEventListener('click', () => {
        document.getElementById('groupVideoInput').click();
    });
    
    document.getElementById('groupVideoInput')?.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleGroupVideoSelect(e.target.files[0]);
        }
    });
    
    document.getElementById('groupAttachLocationBtn')?.addEventListener('click', () => {
        getCurrentLocationForGroup();
    });
    
    // Remove group media
    document.getElementById('removeGroupMediaBtn')?.addEventListener('click', () => {
        groupPendingMedia = { type: null, file: null, location: null };
        document.getElementById('groupMediaPreview').classList.add('hidden');
        document.getElementById('groupPreviewImage').classList.add('hidden');
        document.getElementById('groupPreviewVideo').classList.add('hidden');
    });
    
    // Group message context menu
    document.getElementById('editGroupMessageBtn')?.addEventListener('click', editGroupMessage);
    document.getElementById('deleteGroupMessageBtn')?.addEventListener('click', deleteGroupMessage);
    document.getElementById('reactGroupMessageBtn')?.addEventListener('click', () => {
        if (reactingGroupMessageId) {
            const menu = document.getElementById('groupMessageContextMenu');
            const rect = menu.getBoundingClientRect();
            showGroupReactionPickerAt(rect.left, rect.top - 60);
        }
    });
    
    // Group reaction picker
    document.querySelectorAll('#groupReactionPicker .reaction-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const reaction = e.target.dataset.reaction;
            if (reactingGroupMessageId && currentGroupId) {
                addGroupMessageReaction(reactingGroupMessageId, reaction);
            }
        });
    });
    
    // Close reaction picker on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#groupReactionPicker') && !e.target.closest('.message-item')) {
            document.getElementById('groupReactionPicker').classList.add('hidden');
        }
        if (!e.target.closest('#groupMessageContextMenu') && !e.target.closest('.message-item')) {
            document.getElementById('groupMessageContextMenu').classList.add('hidden');
        }
    });
    
    // Profile - Admin button (in header, mobile)
    const adminNavMobile = document.getElementById('adminNavMobile');
    if (adminNavMobile) {
        adminNavMobile.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            switchView('admin');
        });
    }
    
    // Profile - Edit Profile button (in profile actions)
    const editProfileActionBtn = document.getElementById('editProfileActionBtn');
    if (editProfileActionBtn) {
        editProfileActionBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.getElementById('editProfileForm').classList.remove('hidden');
        });
    }
    
    const cancelEditProfile = document.getElementById('cancelEditProfile');
    if (cancelEditProfile) {
        cancelEditProfile.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.getElementById('editProfileForm').classList.add('hidden');
        });
    }
    
    // Search
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            if (query.length > 0) {
                // Show clear button
                if (clearSearchBtn) {
                    clearSearchBtn.classList.remove('hidden');
                    searchInput.parentElement.classList.add('has-clear-btn');
                }
                // Hide recent searches when typing
                const recentSearches = document.getElementById('recentSearches');
                if (recentSearches) {
                    recentSearches.classList.add('hidden');
                }
                searchTimeout = setTimeout(() => {
                    if (!isLoggedOut) {
                        searchUsers(query);
                    }
                }, 300);
                pendingTimeouts.push(searchTimeout);
            } else {
                // Hide clear button
                if (clearSearchBtn) {
                    clearSearchBtn.classList.add('hidden');
                    searchInput.parentElement.classList.remove('has-clear-btn');
                }
                clearSearchResults();
                // Show recent searches when input is empty
                loadRecentSearches();
            }
        });
    }
    
    // Clear search button
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearSearchBtn.classList.add('hidden');
            if (searchInput.parentElement) {
                searchInput.parentElement.classList.remove('has-clear-btn');
            }
            clearSearchResults();
            loadRecentSearches();
        });
    }
    
    // Clear all recent searches
    const clearAllRecentBtn = document.getElementById('clearAllRecentBtn');
    if (clearAllRecentBtn) {
        clearAllRecentBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            clearAllRecentSearches();
        });
    }
    
    // Follow/Message buttons
    const followBtn = document.getElementById('followBtn');
    if (followBtn) {
        followBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleFollowUser();
        });
    }
    
    const messageUserBtn = document.getElementById('messageUserBtn');
    if (messageUserBtn) {
        messageUserBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleMessageUser();
        });
    }
    
    // Settings
    document.getElementById('enableNotificationsBtn')?.addEventListener('click', toggleNotifications);
    
    // Profile
    document.getElementById('profileForm')?.addEventListener('submit', updateProfile);
    document.getElementById('passwordForm')?.addEventListener('submit', changePassword);
    document.getElementById('avatarInput')?.addEventListener('change', uploadAvatar);
    
    // Chat
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            sendMessage();
        });
    }
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Calls - with permission check
    const callBtn = document.getElementById('callBtn');
    const phoneBtn = document.getElementById('phoneBtn');
    
    if (callBtn) {
        callBtn.addEventListener('click', async () => {
            // Check if permissions are already granted
            const permissionStatus = await checkMediaPermissions();
            if (permissionStatus.supported && permissionStatus.camera === 'denied') {
                if (!confirm('Camera permission was previously denied. Would you like to open browser settings to allow it?\n\n(You can also click the lock icon in the address bar)')) {
                    return;
                }
            }
            startCall('video');
        });
    }
    
    if (phoneBtn) {
        phoneBtn.addEventListener('click', async () => {
            // Check if permissions are already granted
            const permissionStatus = await checkMediaPermissions();
            if (permissionStatus.supported && permissionStatus.microphone === 'denied') {
                if (!confirm('Microphone permission was previously denied. Would you like to open browser settings to allow it?\n\n(You can also click the lock icon in the address bar)')) {
                    return;
                }
            }
            startCall('audio');
        });
    }
    document.getElementById('endCallBtn').addEventListener('click', endCall);
    document.getElementById('muteBtn').addEventListener('click', toggleMute);
    document.getElementById('videoBtn').addEventListener('click', toggleVideo);
    document.getElementById('switchCameraBtn')?.addEventListener('click', switchCamera);
    document.getElementById('screenShareBtn')?.addEventListener('click', toggleScreenShare);
    document.getElementById('holdBtn')?.addEventListener('click', toggleHold);
    document.getElementById('messageBtn')?.addEventListener('click', toggleCallMessageInput);
    document.getElementById('sendCallMessageBtn')?.addEventListener('click', sendCallMessage);
    document.getElementById('closeCallMessageBtn')?.addEventListener('click', toggleCallMessageInput);
    document.getElementById('callMessageText')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendCallMessage();
        }
    });
    document.getElementById('acceptCallBtn').addEventListener('click', acceptIncomingCall);
    document.getElementById('rejectCallBtn').addEventListener('click', rejectIncomingCall);
    
    // Admin
    document.getElementById('createUserBtn')?.addEventListener('click', showCreateUserModal);
    document.getElementById('closeCreateUserModal')?.addEventListener('click', hideCreateUserModal);
    document.getElementById('cancelCreateUser')?.addEventListener('click', hideCreateUserModal);
    // Note: createUserForm uses onsubmit="handleCreateOrUpdateUser(event)" in HTML
    
    // Admin tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active from all tabs
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            // Add active to clicked tab
            e.currentTarget.classList.add('active');
            
            // Determine tab from text content
            const tabText = e.currentTarget.textContent.trim().toLowerCase();
            const tab = tabText.includes('users') ? 'users' : 'audit';
            switchAdminTab(tab);
        });
    });
    
    // Search inputs (old user search - keeping for compatibility)
    const userSearchInput = document.getElementById('userSearch');
    if (userSearchInput) {
        let searchTimeout;
        userSearchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                loadUsers(e.target.value);
            }, 300);
        });
    }
    
    const adminSearchInput = document.getElementById('adminUserSearch');
    if (adminSearchInput) {
        adminSearchInput.addEventListener('input', () => {
            filterUsersInList('adminUserList');
        });
    }
    
    // Media upload buttons
    document.getElementById('attachImageBtn')?.addEventListener('click', () => {
        document.getElementById('imageInput').click();
    });
    document.getElementById('attachVideoBtn')?.addEventListener('click', () => {
        document.getElementById('videoInput').click();
    });
    document.getElementById('attachCircularVideoBtn')?.addEventListener('click', () => {
        document.getElementById('circularVideoInput').click();
    });
    document.getElementById('attachLocationBtn')?.addEventListener('click', getCurrentLocation);
    document.getElementById('imageInput')?.addEventListener('change', handleImageSelect);
    document.getElementById('videoInput')?.addEventListener('change', (e) => handleVideoSelect(e, 'video'));
    document.getElementById('circularVideoInput')?.addEventListener('change', (e) => handleVideoSelect(e, 'circular_video'));
    document.getElementById('removeMediaBtn')?.addEventListener('click', removeMediaPreview);
    
    // Message context menu
    document.getElementById('editMessageBtn')?.addEventListener('click', handleEditMessage);
    document.getElementById('deleteMessageBtn')?.addEventListener('click', handleDeleteMessage);
    document.getElementById('reactMessageBtn')?.addEventListener('click', showReactionPicker);
    
    // Reaction picker - use event delegation since buttons are dynamically created
    document.addEventListener('click', (e) => {
        if (e.target.closest('.reaction-btn')) {
            const btn = e.target.closest('.reaction-btn');
            const reaction = btn.dataset.reaction;
            if (reactingMessageId && reaction) {
                addReactionToMessage(reactingMessageId, reaction);
                hideReactionPicker();
            }
        }
    });
    
    // Close context menus on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.message-item') && !e.target.closest('.context-menu')) {
            document.getElementById('messageContextMenu').classList.add('hidden');
        }
        if (!e.target.closest('.reaction-picker') && !e.target.closest('.reaction-btn')) {
            hideReactionPicker();
        }
    });
}

// Login
async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Reset logout flag on successful login
            isLoggedOut = false;
            accessToken = data.access_token;
            refreshToken = data.refresh_token;
            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
            currentUser = data.user;
            console.log('Login successful:', currentUser.username, 'Role:', currentUser.role);
            showAppScreen();
            loadConversations();
            connectWebSocket();
            
            // Update admin nav visibility after login - use setTimeout to ensure DOM is ready
            setTimeout(() => {
                updateAdminNavVisibility();
                console.log('Admin nav visibility updated after login');
            }, 200);
        } else {
            console.error('Login failed:', data);
            showError('loginError', data.detail || 'Login failed');
        }
    } catch (error) {
        showError('loginError', 'Connection error');
    }
}

// Logout
function handleLogout() {
    console.log('handleLogout called');
    
    // Prevent multiple calls
    if (isLoggedOut) {
        console.log('Already logging out...');
        return;
    }
    
    try {
        // Set logout flag to prevent any new API calls
        isLoggedOut = true;
        
        console.log('Clearing tokens and data...');
        
        // Clear all pending timeouts
        pendingTimeouts.forEach(timeout => clearTimeout(timeout));
        pendingTimeouts = [];
        
        // Abort all pending fetch requests
        abortControllers.forEach(controller => {
            try {
                controller.abort();
            } catch (e) {
                // Ignore abort errors
            }
        });
        abortControllers = [];
        
        // Clear tokens and user data
        try {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
        } catch (e) {
            console.error('Error clearing localStorage:', e);
        }
        
        accessToken = null;
        refreshToken = null;
        currentUser = null;
        
        // Close WebSocket connection
        if (wsConnection) {
            try {
                wsConnection.close();
            } catch (e) {
                console.error('Error closing WebSocket:', e);
            }
            wsConnection = null;
        }
        
        // End any active calls
        try {
            endCall();
        } catch (e) {
            console.error('Error ending call:', e);
        }
        
        // Show login screen
        console.log('Showing login screen...');
        showLoginScreen();
        console.log('Logout successful');
    } catch (error) {
        console.error('Error during logout:', error);
        // Force show login screen even if there's an error
        try {
            showLoginScreen();
        } catch (e) {
            console.error('Error showing login screen:', e);
            // Last resort - reload page
            window.location.href = '/';
        }
    }
}

// Load user profile
async function loadUserProfile() {
    if (isLoggedOut || !accessToken) {
        return;
    }
    
    try {
        const controller = new AbortController();
        abortControllers.push(controller);
        
        const response = await fetch(`${API_BASE}/users/me`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            signal: controller.signal
        });
        
        // Remove controller from list after request completes
        abortControllers = abortControllers.filter(c => c !== controller);
        
        if (response.ok) {
            currentUser = await response.json();
            showAppScreen();
            loadConversations();
            connectWebSocket();
            
            // Update admin nav visibility - use setTimeout to ensure DOM is ready
            setTimeout(() => {
                updateAdminNavVisibility();
                console.log('Admin nav visibility updated after loadUserProfile');
            }, 150);
        } else if (response.status === 401) {
            // Token expired, logout
            handleLogout();
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Request aborted');
            return;
        }
        console.error('Error loading profile:', error);
        if (!isLoggedOut) {
            handleLogout();
        }
    }
}

// Show screens
function showLoginScreen() {
    console.log('showLoginScreen called');
    try {
        const loginScreen = document.getElementById('loginScreen');
        const appScreen = document.getElementById('appScreen');
        
        if (loginScreen) {
            loginScreen.classList.remove('hidden');
        } else {
            console.error('loginScreen element not found!');
        }
        
        if (appScreen) {
            appScreen.classList.add('hidden');
        } else {
            console.error('appScreen element not found!');
        }
        
        // Clear any form data
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.reset();
        }
        
        console.log('Login screen shown successfully');
    } catch (error) {
        console.error('Error showing login screen:', error);
    }
}

function showAppScreen() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appScreen').classList.remove('hidden');
    updateUserInfo();
    
    // Show chat list view by default
    switchView('chat');
    
    // Show admin nav for admin users (both desktop and mobile)
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
        updateAdminNavVisibility();
        console.log('Admin nav visibility updated after showAppScreen');
    }, 100);
    
    // Re-setup logout button after screen is shown (in case it was recreated)
    setTimeout(() => {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn && !logoutBtn.dataset.listenerAdded) {
            logoutBtn.dataset.listenerAdded = 'true';
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Logout button clicked (after showAppScreen)');
                handleLogout();
            });
        }
        
        // Also setup by class
        document.querySelectorAll('.nav-item.logout').forEach(btn => {
            if (!btn.dataset.listenerAdded) {
                btn.dataset.listenerAdded = 'true';
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Logout button clicked (class, after showAppScreen)');
                    handleLogout();
                });
            }
        });
    }, 100);
}

// Update admin nav visibility
function updateAdminNavVisibility() {
    const isAdmin = currentUser && currentUser.role === 'admin';
    
    // Desktop sidebar admin nav
    const adminNav = document.getElementById('adminNav');
    if (adminNav) {
        if (isAdmin) {
            adminNav.classList.remove('hidden');
        } else {
            adminNav.classList.add('hidden');
        }
    }
    
    // Mobile header admin nav (in profile header)
    const adminNavMobile = document.getElementById('adminNavMobile');
    if (adminNavMobile) {
        if (isAdmin) {
            adminNavMobile.classList.remove('hidden');
        } else {
            adminNavMobile.classList.add('hidden');
        }
    }
    
    // Mobile bottom nav admin button
    const adminNavMobileBottom = document.getElementById('adminNavMobileBottom');
    if (adminNavMobileBottom) {
        if (isAdmin) {
            adminNavMobileBottom.classList.remove('hidden');
            adminNavMobileBottom.style.display = 'flex';
            adminNavMobileBottom.style.visibility = 'visible';
            adminNavMobileBottom.style.opacity = '1';
            console.log('✅ Admin nav shown in mobile bottom nav', adminNavMobileBottom);
        } else {
            adminNavMobileBottom.classList.add('hidden');
            adminNavMobileBottom.style.display = 'none';
            console.log('ℹ️ Admin nav hidden (user is not admin)');
        }
    } else {
        console.error('❌ adminNavMobileBottom element not found!');
    }
}

function updateUserInfo() {
    loadUserProfile().then(() => {
        // Update admin nav visibility after profile loads
        updateAdminNavVisibility();
    });
}

// Switch views
function switchView(view) {
    if (!view) return;
    
    console.log('Switching to view:', view);
    
    // Update nav items (both mobile and desktop)
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
        if (item.dataset.view === view) {
            item.classList.add('active');
            // Update profile image border if active
            const profileImg = item.querySelector('.nav-profile-img');
            if (profileImg) {
                profileImg.classList.add('active');
            }
        } else {
            item.classList.remove('active');
            // Remove active from profile image
            const profileImg = item.querySelector('.nav-profile-img');
            if (profileImg) {
                profileImg.classList.remove('active');
            }
        }
    });
    
    // Hide all views
    document.querySelectorAll('.view-container').forEach(container => {
        container.classList.add('hidden');
        container.classList.remove('active');
    });
    
    // Hide chat view if switching away
    const chatView = document.getElementById('chatView');
    if (chatView && view !== 'chat') {
        chatView.classList.add('hidden');
    }
    
    // Show selected view
    if (view === 'chat') {
        const chatListView = document.getElementById('chatListView');
        if (chatListView) {
            chatListView.classList.remove('hidden');
            chatListView.classList.add('active');
            loadConversations();
        }
    } else if (view === 'search') {
        const searchView = document.getElementById('searchView');
        if (searchView) {
            searchView.classList.remove('hidden');
            searchView.classList.add('active');
            const searchInput = document.getElementById('searchInput');
            // Always load recent searches when switching to search view
            // unless there's text in the input
            if (!searchInput || searchInput.value.trim() === '') {
                clearSearchResults();
                // Small delay to ensure DOM is ready
                setTimeout(() => {
                    loadRecentSearches();
                }, 100);
            }
        }
    } else if (view === 'profile') {
        const profileView = document.getElementById('profileView');
        if (profileView) {
            profileView.classList.remove('hidden');
            profileView.classList.add('active');
            loadUserProfile();
        }
    } else if (view === 'settings') {
        const settingsView = document.getElementById('settingsView');
        if (settingsView) {
            settingsView.classList.remove('hidden');
            settingsView.classList.add('active');
        }
    } else if (view === 'admin') {
        const adminView = document.getElementById('adminView');
        if (adminView) {
            if (currentUser && currentUser.role === 'admin') {
                adminView.classList.remove('hidden');
                adminView.classList.add('active');
                loadAdminUsers();
            } else {
                // If not admin, switch to chat view
                console.warn('User is not an admin, switching to chat view');
                switchView('chat');
            }
        }
    }
}

// Switch chat tab (conversations/groups)
function switchChatTab(tab) {
    const conversationsTab = document.getElementById('conversationsTab');
    const groupsTab = document.getElementById('groupsTab');
    const conversationsContent = document.getElementById('conversationsTabContent');
    const groupsContent = document.getElementById('groupsTabContent');
    
    if (tab === 'conversations') {
        conversationsTab?.classList.add('active');
        groupsTab?.classList.remove('active');
        conversationsContent?.classList.remove('hidden');
        groupsContent?.classList.add('hidden');
        loadConversations();
    } else if (tab === 'groups') {
        groupsTab?.classList.add('active');
        conversationsTab?.classList.remove('active');
        groupsContent?.classList.remove('hidden');
        conversationsContent?.classList.add('hidden');
        loadGroups();
    }
}

// Load conversations list
async function loadConversations() {
    if (isLoggedOut || !accessToken) {
        return;
    }
    
    try {
        const controller = new AbortController();
        abortControllers.push(controller);
        
        const response = await fetch(`${API_BASE}/messages/conversations`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            signal: controller.signal
        });
        
        // Remove controller from list after request completes
        abortControllers = abortControllers.filter(c => c !== controller);
        
        if (response.ok) {
            const conversations = await response.json();
            displayConversations(conversations);
        } else if (response.status === 401) {
            // Token expired, logout
            handleLogout();
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Request aborted');
            return;
        }
        console.error('Error loading conversations:', error);
    }
}

// Display conversations
function displayConversations(conversations) {
    const container = document.getElementById('conversationsList');
    container.innerHTML = '';
    
    if (conversations.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-comments"></i>
                <p>No conversations yet</p>
            </div>
        `;
        return;
    }
    
    conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = 'conversation-item';
        item.dataset.userId = conv.user_id;
        
        const avatarUrl = conv.profile_pic 
            ? `/uploads/${conv.profile_pic}` 
            : '/static/default-avatar.png';
        
        const time = formatTime(conv.last_message_time);
        const unreadBadge = conv.unread_count > 0 
            ? `<span class="unread-badge">${conv.unread_count}</span>` 
            : '';
        
        item.innerHTML = `
            <div class="conversation-item-content" onclick="openChat(${conv.user_id}, '${escapeHtml(conv.username)}', '${avatarUrl}')">
                <div class="avatar-wrapper">
                    <img src="${avatarUrl}" alt="${escapeHtml(conv.username)}" class="avatar-small"
                         onerror="this.src='/static/default-avatar.png'">
                </div>
                <div class="conversation-info">
                    <div class="conversation-name">${escapeHtml(conv.username)}</div>
                    <div class="conversation-preview">${escapeHtml(conv.last_message || '')}</div>
                </div>
                <div class="conversation-time">${time} ${unreadBadge}</div>
            </div>
            <button class="conversation-delete-btn" onclick="event.stopPropagation(); deleteConversation(${conv.user_id}, '${escapeHtml(conv.username)}')" title="Delete conversation">
                <i class="fas fa-trash"></i>
            </button>
        `;
        
        container.appendChild(item);
    });
}

// Delete conversation
async function deleteConversation(userId, username) {
    if (!confirm(`Are you sure you want to delete the conversation with "${username}"? This will delete all your messages in this conversation.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/messages/conversations/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            showSuccess('Conversation deleted successfully');
            // Reload conversations list
            loadConversations();
        } else {
            const errorData = await response.json();
            showError(errorData.detail || 'Failed to delete conversation');
        }
    } catch (error) {
        console.error('Error deleting conversation:', error);
        showError('Failed to delete conversation. Please try again.');
    }
}

// Load followers count
async function loadFollowersCount(userId) {
    try {
        const response = await fetch(`${API_BASE}/users/${userId}/followers`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (response.ok) {
            const followers = await response.json();
            document.getElementById('followersCount').textContent = followers.length;
        }
    } catch (error) {
        console.error('Error loading followers count:', error);
    }
}

// Load following count
async function loadFollowingCount(userId) {
    try {
        const response = await fetch(`${API_BASE}/users/${userId}/following`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (response.ok) {
            const following = await response.json();
            document.getElementById('followingCount').textContent = following.length;
        }
    } catch (error) {
        console.error('Error loading following count:', error);
    }
}

// Show followers modal
async function showFollowers() {
    if (!currentUser) return;
    
    const modal = document.getElementById('followersModal');
    const title = document.getElementById('followersModalTitle');
    const list = document.getElementById('followersList');
    
    title.textContent = 'Followers';
    list.innerHTML = '<div class="loading-message"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    modal.classList.remove('hidden');
    
    try {
        const response = await fetch(`${API_BASE}/users/${currentUser.id}/followers`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            const followers = await response.json();
            displayFollowersList(followers, 'followers');
        } else {
            list.innerHTML = '<div class="empty-state">Failed to load followers</div>';
        }
    } catch (error) {
        console.error('Error loading followers:', error);
        list.innerHTML = '<div class="empty-state">Error loading followers</div>';
    }
}

// Show following modal
async function showFollowing() {
    if (!currentUser) return;
    
    const modal = document.getElementById('followersModal');
    const title = document.getElementById('followersModalTitle');
    const list = document.getElementById('followersList');
    
    title.textContent = 'Following';
    list.innerHTML = '<div class="loading-message"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    modal.classList.remove('hidden');
    
    try {
        const response = await fetch(`${API_BASE}/users/${currentUser.id}/following`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            const following = await response.json();
            displayFollowersList(following, 'following');
        } else {
            list.innerHTML = '<div class="empty-state">Failed to load following</div>';
        }
    } catch (error) {
        console.error('Error loading following:', error);
        list.innerHTML = '<div class="empty-state">Error loading following</div>';
    }
}

// Display followers/following list
function displayFollowersList(users, type) {
    const list = document.getElementById('followersList');
    list.innerHTML = '';
    
    if (users.length === 0) {
        list.innerHTML = `<div class="empty-state"><p>No ${type} found</p></div>`;
        return;
    }
    
    users.forEach(user => {
        const item = document.createElement('div');
        item.className = 'follower-item';
        item.onclick = () => {
            hideFollowersModal();
            showUserProfile(user.id);
        };
        
        const avatarUrl = user.profile_pic 
            ? `/uploads/${user.profile_pic}` 
            : '/static/default-avatar.png';
        
        item.innerHTML = `
            <img src="${avatarUrl}" alt="${escapeHtml(user.username)}" class="avatar-small"
                 onerror="this.src='/static/default-avatar.png'">
            <div class="follower-info">
                <div class="follower-name">${escapeHtml(user.username)}</div>
                <div class="follower-fullname">${escapeHtml((user.first_name || '') + ' ' + (user.last_name || '')).trim() || ''}</div>
            </div>
        `;
        
        list.appendChild(item);
    });
}

// Hide followers modal
function hideFollowersModal() {
    document.getElementById('followersModal').classList.add('hidden');
}

// Group functions
let selectedGroupMembers = [];

// Show create group modal
function showCreateGroupModal() {
    selectedGroupMembers = [];
    document.getElementById('createGroupForm').reset();
    document.getElementById('selectedMembers').innerHTML = '';
    document.getElementById('memberSearchResults').innerHTML = '';
    document.getElementById('memberSearchResults').classList.add('hidden');
    document.getElementById('createGroupMessage').textContent = '';
    document.getElementById('createGroupMessage').className = 'message';
    document.getElementById('createGroupModal').classList.remove('hidden');
}

// Hide create group modal
function hideCreateGroupModal() {
    document.getElementById('createGroupModal').classList.add('hidden');
    selectedGroupMembers = [];
    document.getElementById('selectedMembers').innerHTML = '';
}

// Search users for group
async function searchUsersForGroup(query) {
    if (!query || query.trim().length < 1) {
        document.getElementById('memberSearchResults').classList.add('hidden');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/users/list?search=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            const users = await response.json();
            displayMemberSearchResults(users);
        }
    } catch (error) {
        console.error('Error searching users for group:', error);
    }
}

// Display member search results
function displayMemberSearchResults(users) {
    const container = document.getElementById('memberSearchResults');
    container.innerHTML = '';
    
    // Filter out already selected members and current user
    const selectedIds = new Set(selectedGroupMembers.map(m => m.id));
    const filteredUsers = users.filter(user => 
        user.id !== currentUser?.id && !selectedIds.has(user.id)
    );
    
    if (filteredUsers.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 12px;">No users found</div>';
    } else {
        filteredUsers.forEach(user => {
            const item = document.createElement('div');
            item.className = 'member-search-item';
            item.onclick = () => addMemberToGroup(user);
            
            const avatarUrl = user.profile_pic 
                ? `/uploads/${user.profile_pic}` 
                : '/static/default-avatar.png';
            
            item.innerHTML = `
                <img src="${avatarUrl}" alt="${escapeHtml(user.username)}" class="avatar-small"
                     onerror="this.src='/static/default-avatar.png'">
                <div class="follower-info">
                    <div class="follower-name">${escapeHtml(user.username)}</div>
                    <div class="follower-fullname">${escapeHtml((user.first_name || '') + ' ' + (user.last_name || '')).trim() || ''}</div>
                </div>
            `;
            
            container.appendChild(item);
        });
    }
    
    container.classList.remove('hidden');
}

// Add member to group
function addMemberToGroup(user) {
    if (selectedGroupMembers.find(m => m.id === user.id)) {
        return; // Already added
    }
    
    selectedGroupMembers.push(user);
    updateSelectedMembersDisplay();
    document.getElementById('memberSearchInput').value = '';
    document.getElementById('memberSearchResults').classList.add('hidden');
}

// Remove member from group
function removeMemberFromGroup(userId) {
    selectedGroupMembers = selectedGroupMembers.filter(m => m.id !== userId);
    updateSelectedMembersDisplay();
}

// Update selected members display
function updateSelectedMembersDisplay() {
    const container = document.getElementById('selectedMembers');
    container.innerHTML = '';
    
    selectedGroupMembers.forEach(member => {
        const item = document.createElement('div');
        item.className = 'selected-member';
        item.innerHTML = `
            <span>${escapeHtml(member.username)}</span>
            <span class="selected-member-remove" onclick="removeMemberFromGroup(${member.id})">×</span>
        `;
        container.appendChild(item);
    });
}

// Handle create group
async function handleCreateGroup(e) {
    e.preventDefault();
    
    const name = document.getElementById('groupName').value.trim();
    const description = document.getElementById('groupDescription').value.trim();
    const messageEl = document.getElementById('createGroupMessage');
    
    if (!name) {
        showError('createGroupMessage', 'Group name is required');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/groups/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                name: name,
                description: description || null,
                member_ids: selectedGroupMembers.map(m => m.id)
            })
        });
        
        if (response.ok) {
            const group = await response.json();
            hideCreateGroupModal();
            showSuccess('Group created successfully');
            // Switch to groups tab and reload
            switchChatTab('groups');
            loadGroups();
        } else {
            const data = await response.json();
            showError('createGroupMessage', data.detail || 'Failed to create group');
        }
    } catch (error) {
        console.error('Error creating group:', error);
        showError('createGroupMessage', 'Failed to create group. Please try again.');
    }
}

// Load groups
async function loadGroups() {
    if (isLoggedOut || !accessToken) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/groups/`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            const groups = await response.json();
            displayGroups(groups);
        } else if (response.status === 401) {
            handleLogout();
        }
    } catch (error) {
        console.error('Error loading groups:', error);
    }
}

// Display groups
function displayGroups(groups) {
    const container = document.getElementById('groupsList');
    container.innerHTML = '';
    
    if (groups.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>No groups yet</p>
                <p style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">Create a group to get started</p>
            </div>
        `;
        return;
    }
    
    groups.forEach(group => {
        const item = document.createElement('div');
        item.className = 'group-item';
        item.onclick = () => openGroupChat(group.id, group.name);
        
        const groupInitial = group.name.charAt(0).toUpperCase();
        const memberCount = group.member_count || 0;
        
        // Show avatar if exists, otherwise show initial
        let avatarHtml = '';
        if (group.avatar) {
            avatarHtml = `<img src="/uploads/${group.avatar}" alt="${escapeHtml(group.name)}" class="group-avatar-img" style="width: 56px; height: 56px; border-radius: 50%; object-fit: cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`;
        }
        avatarHtml += `<div class="group-avatar" ${group.avatar ? 'style="display:none;"' : ''}>${groupInitial}</div>`;
        
        item.innerHTML = `
            <div class="avatar-wrapper">
                ${avatarHtml}
            </div>
            <div class="group-info">
                <div class="group-name">${escapeHtml(group.name)}</div>
                <div class="group-preview">${memberCount} member${memberCount !== 1 ? 's' : ''}</div>
            </div>
        `;
        
        container.appendChild(item);
    });
}

// Open group chat
async function openGroupChat(groupId, groupName) {
    currentGroupId = groupId;
    
    // Hide all views and show group chat view
    document.querySelectorAll('.view-container').forEach(v => {
        v.classList.add('hidden');
        v.classList.remove('active');
    });
    document.getElementById('groupChatView').classList.remove('hidden');
    document.getElementById('groupChatView').classList.add('active');
    
    document.getElementById('groupChatName').textContent = groupName;
    const groupInitial = groupName.charAt(0).toUpperCase();
    const avatarEl = document.getElementById('groupChatAvatar');
    const avatarImgEl = document.getElementById('groupChatAvatarImg');
    
    // Load group info and messages
    await loadGroupInfo(groupId);
    await loadGroupMessages(groupId);
    
    // Update permissions UI
    updateGroupPermissionsUI();
}

// Update group permissions UI based on user role
function updateGroupPermissionsUI() {
    // This will be called after group info is loaded
    // Permissions are handled in loadGroupInfo
}

// Show group info (click on header)
function showGroupInfo() {
    showGroupMembers();
}

// Store current group info
let currentGroupInfo = null;

// Load group info
async function loadGroupInfo(groupId) {
    try {
        const response = await fetch(`${API_BASE}/groups/${groupId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            const group = await response.json();
            currentGroupInfo = group;
            
            document.getElementById('groupChatMemberCount').innerHTML = 
                `<i class="fas fa-users"></i> ${group.member_count || 0} member${group.member_count !== 1 ? 's' : ''}`;
            
            // Update avatar
            const avatarEl = document.getElementById('groupChatAvatar');
            const avatarImgEl = document.getElementById('groupChatAvatarImg');
            if (group.avatar) {
                avatarImgEl.src = `/uploads/${group.avatar}`;
                avatarImgEl.style.display = 'block';
                avatarEl.style.display = 'none';
            } else {
                const groupInitial = group.name.charAt(0).toUpperCase();
                avatarEl.textContent = groupInitial;
                avatarImgEl.style.display = 'none';
                avatarEl.style.display = 'flex';
            }
            
            // Update permissions UI
            const isOwner = group.is_owner || false;
            const isAdmin = group.is_admin || false;
            
            // Show/hide menu items based on permissions
            const editGroupBtn = document.getElementById('editGroupBtn');
            const uploadGroupAvatarBtn = document.getElementById('uploadGroupAvatarBtn');
            const deleteGroupBtn = document.getElementById('deleteGroupBtn');
            const leaveGroupBtn = document.getElementById('leaveGroupBtn');
            
            if (editGroupBtn) editGroupBtn.style.display = (isOwner || isAdmin) ? 'flex' : 'none';
            if (uploadGroupAvatarBtn) uploadGroupAvatarBtn.style.display = (isOwner || isAdmin) ? 'flex' : 'none';
            if (deleteGroupBtn) deleteGroupBtn.style.display = isOwner ? 'flex' : 'none';
            if (leaveGroupBtn) leaveGroupBtn.style.display = !isOwner ? 'flex' : 'none';
        }
    } catch (error) {
        console.error('Error loading group info:', error);
    }
}

// Load group messages
async function loadGroupMessages(groupId) {
    try {
        const response = await fetch(`${API_BASE}/groups/${groupId}/messages?limit=50`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            const messages = await response.json();
            displayGroupMessages(messages);
        }
    } catch (error) {
        console.error('Error loading group messages:', error);
    }
}

// Display group messages
function displayGroupMessages(messages) {
    const container = document.getElementById('groupChatMessages');
    container.innerHTML = '';
    
    messages.forEach(msg => {
        if (msg.is_deleted) {
            const msgEl = document.createElement('div');
            msgEl.className = `message-item deleted ${msg.sender_id === currentUser.id ? 'own' : ''}`;
            msgEl.innerHTML = `
                <div class="message-bubble deleted-message">
                    <i class="fas fa-trash"></i> This message was deleted
                </div>
            `;
            container.appendChild(msgEl);
            return;
        }
        
        const isOwn = msg.sender_id === currentUser.id;
        const msgEl = document.createElement('div');
        msgEl.className = `message-item ${isOwn ? 'own' : ''}`;
        msgEl.dataset.messageId = msg.id;
        
        let messageContent = '';
        if (msg.message_type === 'image' && msg.attachment) {
            messageContent = `<img src="/uploads/${msg.attachment}" alt="Image" class="message-image" onclick="openImageModal('/uploads/${msg.attachment}')">`;
        } else if (msg.message_type === 'video' && msg.attachment) {
            messageContent = `<video src="/uploads/${msg.attachment}" controls class="message-video"></video>`;
        } else if (msg.message_type === 'circular_video' && msg.attachment) {
            messageContent = `<video src="/uploads/${msg.attachment}" controls class="message-video circular-video"></video>`;
        } else if (msg.message_type === 'location' && msg.location_lat && msg.location_lng) {
            messageContent = `
                <div class="message-location">
                    <i class="fas fa-map-marker-alt"></i>
                    <a href="https://www.google.com/maps?q=${msg.location_lat},${msg.location_lng}" target="_blank">
                        View Location
                    </a>
                    <div class="location-map">
                        <iframe 
                            src="https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dP9Jb3w&q=${msg.location_lat},${msg.location_lng}"
                            width="100%" height="200" frameborder="0" style="border:0;" allowfullscreen>
                        </iframe>
                    </div>
                </div>
            `;
        }
        
        if (msg.content) {
            messageContent += `<div class="message-text">${escapeHtml(msg.content)}</div>`;
        }
        
        // Reactions display
        let reactionsHtml = '';
        if (msg.reactions && msg.reactions.length > 0) {
            const reactionsByType = {};
            msg.reactions.forEach(r => {
                const emoji = getReactionEmoji(r.reaction_type);
                if (!reactionsByType[r.reaction_type]) {
                    reactionsByType[r.reaction_type] = { count: 0, users: [] };
                }
                reactionsByType[r.reaction_type].count++;
                reactionsByType[r.reaction_type].users.push(r.user.username);
            });
            
            reactionsHtml = '<div class="message-reactions">';
            Object.entries(reactionsByType).forEach(([type, data]) => {
                reactionsHtml += `<span class="reaction-badge" title="${data.users.join(', ')}">${getReactionEmoji(type)} ${data.count}</span>`;
            });
            reactionsHtml += '</div>';
        }
        
        // Show sender name for group messages (unless it's own message)
        const senderName = isOwn ? 'You' : (msg.sender.username || 'Unknown');
        
        msgEl.innerHTML = `
            <img src="${msg.sender.profile_pic ? `/uploads/${msg.sender.profile_pic}` : '/static/default-avatar.png'}" 
                 alt="Avatar" class="avatar-small">
            <div class="message-bubble">
                ${!isOwn ? `<div class="message-sender-name">${escapeHtml(senderName)}</div>` : ''}
                ${messageContent}
                ${reactionsHtml}
                <div class="message-time">
                    ${formatTime(msg.created_at)}
                    ${msg.edited_at ? '<span class="edited-badge">(edited)</span>' : ''}
                </div>
                ${isOwn ? '<button class="message-menu-btn" onclick="showGroupMessageMenu(event, ' + msg.id + ')"><i class="fas fa-ellipsis-v"></i></button>' : ''}
            </div>
        `;
        
        if (isOwn) {
            msgEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showGroupMessageMenu(e, msg.id);
            });
        }
        
        // Allow double-click to react on any message
        msgEl.addEventListener('dblclick', (e) => {
            e.preventDefault();
            reactingGroupMessageId = msg.id;
            const rect = msgEl.getBoundingClientRect();
            showGroupReactionPickerAt(rect.left + rect.width / 2, rect.top - 60);
        });
        
        container.appendChild(msgEl);
    });
    
    container.scrollTop = container.scrollHeight;
}

// Show group message menu
function showGroupMessageMenu(event, messageId) {
    const menu = document.getElementById('groupMessageContextMenu');
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    menu.classList.remove('hidden');
    editingGroupMessageId = messageId;
    reactingGroupMessageId = messageId;
}

// Show group reaction picker
function showGroupReactionPickerAt(x, y) {
    const picker = document.getElementById('groupReactionPicker');
    picker.style.left = x + 'px';
    picker.style.top = y + 'px';
    picker.classList.remove('hidden');
}

// Send group message
async function sendGroupMessage() {
    const input = document.getElementById('groupMessageInput');
    const content = input.value.trim();
    
    if ((!content && !groupPendingMedia.type) || !currentGroupId) return;
    
    let attachment = null;
    let messageType = 'text';
    let locationLat = null;
    let locationLng = null;
    
    // Handle media upload
    if (groupPendingMedia.type) {
        if (groupPendingMedia.type === 'location') {
            messageType = 'location';
            locationLat = groupPendingMedia.location.lat;
            locationLng = groupPendingMedia.location.lng;
        } else {
            // Upload file first (similar to individual chat)
            try {
                const formData = new FormData();
                formData.append('file', groupPendingMedia.file);
                
                const uploadResponse = await fetch(`${API_BASE}/messages/upload`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${accessToken}` },
                    body: formData
                });
                
                if (uploadResponse.ok) {
                    const uploadData = await uploadResponse.json();
                    attachment = uploadData.filename;
                    messageType = groupPendingMedia.type;
                }
            } catch (error) {
                console.error('Error uploading file:', error);
                showError('Failed to upload file');
                return;
            }
        }
    }
    
    try {
        const response = await fetch(`${API_BASE}/groups/${currentGroupId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                content: content || null,
                attachment: attachment,
                message_type: messageType,
                location_lat: locationLat,
                location_lng: locationLng
            })
        });
        
        if (response.ok) {
            input.value = '';
            groupPendingMedia = { type: null, file: null, location: null };
            document.getElementById('groupMediaPreview').classList.add('hidden');
            
            // Reload messages
            await loadGroupMessages(currentGroupId);
        } else {
            const data = await response.json();
            showError(data.detail || 'Failed to send message');
        }
    } catch (error) {
        console.error('Error sending group message:', error);
        showError('Failed to send message');
    }
}

// Show group members
async function showGroupMembers() {
    if (!currentGroupId) return;
    
    const modal = document.getElementById('groupMembersModal');
    const list = document.getElementById('groupMembersList');
    const addMemberBtnContainer = document.getElementById('addMemberBtnContainer');
    
    list.innerHTML = '<div class="loading-message"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    modal.classList.remove('hidden');
    
    // Show/hide add member button based on permissions
    const isOwner = currentGroupInfo?.is_owner || false;
    const isAdmin = currentGroupInfo?.is_admin || false;
    if (addMemberBtnContainer) {
        addMemberBtnContainer.style.display = (isOwner || isAdmin) ? 'block' : 'none';
    }
    
    try {
        const response = await fetch(`${API_BASE}/groups/${currentGroupId}/members`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            const members = await response.json();
            displayGroupMembers(members);
        } else {
            list.innerHTML = '<div class="empty-state">Failed to load members</div>';
        }
    } catch (error) {
        console.error('Error loading group members:', error);
        list.innerHTML = '<div class="empty-state">Error loading members</div>';
    }
}

// Display group members
function displayGroupMembers(members) {
    const list = document.getElementById('groupMembersList');
    list.innerHTML = '';
    
    if (members.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>No members found</p></div>';
        return;
    }
    
    const isOwner = currentGroupInfo?.is_owner || false;
    
    members.forEach(member => {
        const item = document.createElement('div');
        item.className = 'follower-item';
        item.style.position = 'relative';
        
        const avatarUrl = member.user.profile_pic 
            ? `/uploads/${member.user.profile_pic}` 
            : '/static/default-avatar.png';
        
        const isOwnerMember = currentGroupInfo?.created_by === member.user_id;
        const roleBadge = isOwnerMember 
            ? '<span class="role-badge owner-badge" style="margin-left: 8px; background: #ffc107; color: #000;">Owner</span>' 
            : (member.role === 'admin' 
                ? '<span class="role-badge admin-badge" style="margin-left: 8px;">Admin</span>' 
                : '');
        
        // Actions menu for owner/admin
        let actionsMenu = '';
        if (isOwner && !isOwnerMember) {
            actionsMenu = `
                <div class="member-actions">
                    <button class="btn-icon-small" onclick="event.stopPropagation(); showMemberActionsMenu(event, ${member.user_id}, '${member.role}')">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div id="memberActionsMenu_${member.user_id}" class="dropdown-menu-small hidden" style="position: absolute; right: 0; top: 100%; background: white; border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 1000; min-width: 150px;">
                        ${member.role === 'admin' 
                            ? `<button class="dropdown-item-small" onclick="changeMemberRole(${member.user_id}, 'member')">Remove Admin</button>`
                            : `<button class="dropdown-item-small" onclick="changeMemberRole(${member.user_id}, 'admin')">Make Admin</button>`
                        }
                        <button class="dropdown-item-small" onclick="removeGroupMember(${member.user_id})" style="color: #dc3545;">Remove Member</button>
                    </div>
                </div>
            `;
        } else if (currentGroupInfo?.is_admin && !isOwnerMember && member.role !== 'admin') {
            actionsMenu = `
                <div class="member-actions">
                    <button class="btn-icon-small" onclick="event.stopPropagation(); removeGroupMember(${member.user_id})" title="Remove Member">
                        <i class="fas fa-times" style="color: #dc3545;"></i>
                    </button>
                </div>
            `;
        }
        
        item.innerHTML = `
            <img src="${avatarUrl}" alt="${escapeHtml(member.user.username)}" class="avatar-small"
                 onerror="this.src='/static/default-avatar.png'">
            <div class="follower-info" style="flex: 1;">
                <div class="follower-name">${escapeHtml(member.user.username)}${roleBadge}</div>
                <div class="follower-fullname">${escapeHtml((member.user.first_name || '') + ' ' + (member.user.last_name || '')).trim() || ''}</div>
            </div>
            ${actionsMenu}
        `;
        
        list.appendChild(item);
    });
}

// Show member actions menu
function showMemberActionsMenu(event, userId, currentRole) {
    event.stopPropagation();
    
    // Hide all other menus
    document.querySelectorAll('.dropdown-menu-small').forEach(menu => {
        menu.classList.add('hidden');
    });
    
    // Show this menu
    const menu = document.getElementById(`memberActionsMenu_${userId}`);
    if (menu) {
        menu.classList.toggle('hidden');
        
        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!e.target.closest(`#memberActionsMenu_${userId}`) && !e.target.closest(`.member-actions`)) {
                    menu.classList.add('hidden');
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 100);
    }
}

// Change member role
async function changeMemberRole(userId, newRole) {
    if (!currentGroupId) return;
    
    try {
        const response = await fetch(`${API_BASE}/groups/${currentGroupId}/members/${userId}/role?role=${newRole}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            showSuccess(`Member role updated to ${newRole}`);
            await loadGroupInfo(currentGroupId);
            showGroupMembers();
        } else {
            const data = await response.json();
            showError(data.detail || 'Failed to change member role');
        }
    } catch (error) {
        console.error('Error changing member role:', error);
        showError('Failed to change member role. Please try again.');
    }
}

// Remove group member
async function removeGroupMember(userId) {
    if (!currentGroupId) return;
    
    if (!confirm('Are you sure you want to remove this member from the group?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/groups/${currentGroupId}/members/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            showSuccess('Member removed successfully');
            await loadGroupInfo(currentGroupId);
            showGroupMembers();
        } else {
            const data = await response.json();
            showError(data.detail || 'Failed to remove member');
        }
    } catch (error) {
        console.error('Error removing group member:', error);
        showError('Failed to remove member. Please try again.');
    }
}

// Hide group members modal
function hideGroupMembersModal() {
    document.getElementById('groupMembersModal').classList.add('hidden');
}

// Show add group member modal
function showAddGroupMemberModal() {
    document.getElementById('addGroupMemberSearchInput').value = '';
    document.getElementById('addMemberSearchResults').innerHTML = '';
    document.getElementById('addMemberSearchResults').classList.add('hidden');
    document.getElementById('addGroupMemberMessage').textContent = '';
    document.getElementById('addGroupMemberModal').classList.remove('hidden');
}

// Hide add group member modal
function hideAddGroupMemberModal() {
    document.getElementById('addGroupMemberModal').classList.add('hidden');
}

// Search users to add to group
async function searchUsersToAddToGroup(query) {
    if (!query || query.trim().length < 1) {
        document.getElementById('addMemberSearchResults').classList.add('hidden');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/users/list?search=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            const users = await response.json();
            displayAddMemberSearchResults(users);
        }
    } catch (error) {
        console.error('Error searching users:', error);
    }
}

// Display add member search results
function displayAddMemberSearchResults(users) {
    const container = document.getElementById('addMemberSearchResults');
    container.innerHTML = '';
    
    // Get current group members to filter them out
    // TODO: Load current members and filter
    const filteredUsers = users.filter(user => user.id !== currentUser?.id);
    
    if (filteredUsers.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 12px;">No users found</div>';
    } else {
        filteredUsers.forEach(user => {
            const item = document.createElement('div');
            item.className = 'member-search-item';
            item.onclick = () => addMemberToExistingGroup(user.id);
            
            const avatarUrl = user.profile_pic 
                ? `/uploads/${user.profile_pic}` 
                : '/static/default-avatar.png';
            
            item.innerHTML = `
                <img src="${avatarUrl}" alt="${escapeHtml(user.username)}" class="avatar-small"
                     onerror="this.src='/static/default-avatar.png'">
                <div class="follower-info">
                    <div class="follower-name">${escapeHtml(user.username)}</div>
                    <div class="follower-fullname">${escapeHtml((user.first_name || '') + ' ' + (user.last_name || '')).trim() || ''}</div>
                </div>
            `;
            
            container.appendChild(item);
        });
    }
    
    container.classList.remove('hidden');
}

// Add member to existing group
async function addMemberToExistingGroup(userId) {
    if (!currentGroupId) return;
    
    try {
        const response = await fetch(`${API_BASE}/groups/${currentGroupId}/members?user_id=${userId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            hideAddGroupMemberModal();
            showSuccess('Member added successfully');
            // Reload group info and members
            await loadGroupInfo(currentGroupId);
            showGroupMembers();
        } else {
            const data = await response.json();
            showError('addGroupMemberMessage', data.detail || 'Failed to add member');
        }
    } catch (error) {
        console.error('Error adding member to group:', error);
        showError('addGroupMemberMessage', 'Failed to add member');
    }
}

// Handle group image select
function handleGroupImageSelect(file) {
    groupPendingMedia = { type: 'image', file: file, location: null };
    const preview = document.getElementById('groupPreviewImage');
    const previewContainer = document.getElementById('groupMediaPreview');
    const reader = new FileReader();
    reader.onload = (e) => {
        preview.src = e.target.result;
        preview.classList.remove('hidden');
        document.getElementById('groupPreviewVideo').classList.add('hidden');
        previewContainer.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

// Handle group video select
function handleGroupVideoSelect(file) {
    groupPendingMedia = { type: 'video', file: file, location: null };
    const preview = document.getElementById('groupPreviewVideo');
    const previewContainer = document.getElementById('groupMediaPreview');
    const reader = new FileReader();
    reader.onload = (e) => {
        preview.src = e.target.result;
        preview.classList.remove('hidden');
        document.getElementById('groupPreviewImage').classList.add('hidden');
        previewContainer.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

// Get current location for group
function getCurrentLocationForGroup() {
    if (!navigator.geolocation) {
        showError('Geolocation is not supported by your browser');
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            groupPendingMedia = {
                type: 'location',
                file: null,
                location: {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                }
            };
            showSuccess('Location captured. Click send to share.');
        },
        (error) => {
            showError('Failed to get location: ' + error.message);
        }
    );
}

// Edit group message
async function editGroupMessage() {
    if (!editingGroupMessageId || !currentGroupId) return;
    
    const message = document.querySelector(`[data-message-id="${editingGroupMessageId}"]`);
    if (!message) return;
    
    const messageText = message.querySelector('.message-text');
    if (!messageText) return;
    
    const newContent = prompt('Edit message:', messageText.textContent);
    if (newContent === null || newContent.trim() === '') return;
    
    try {
        const response = await fetch(`${API_BASE}/groups/${currentGroupId}/messages/${editingGroupMessageId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ content: newContent.trim() })
        });
        
        if (response.ok) {
            document.getElementById('groupMessageContextMenu').classList.add('hidden');
            await loadGroupMessages(currentGroupId);
        } else {
            const data = await response.json();
            showError(data.detail || 'Failed to edit message');
        }
    } catch (error) {
        console.error('Error editing group message:', error);
        showError('Failed to edit message');
    }
}

// Delete group message
async function deleteGroupMessage() {
    if (!editingGroupMessageId || !currentGroupId) return;
    
    if (!confirm('Are you sure you want to delete this message?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/groups/${currentGroupId}/messages/${editingGroupMessageId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            document.getElementById('groupMessageContextMenu').classList.add('hidden');
            await loadGroupMessages(currentGroupId);
        } else {
            const data = await response.json();
            showError(data.detail || 'Failed to delete message');
        }
    } catch (error) {
        console.error('Error deleting group message:', error);
        showError('Failed to delete message');
    }
}

// Add group message reaction
async function addGroupMessageReaction(messageId, reactionType) {
    if (!currentGroupId) return;
    
    try {
        const response = await fetch(`${API_BASE}/groups/${currentGroupId}/messages/${messageId}/reactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ reaction_type: reactionType })
        });
        
        if (response.ok || response.status === 200) {
            document.getElementById('groupReactionPicker').classList.add('hidden');
            await loadGroupMessages(currentGroupId);
        } else {
            const data = await response.json();
            if (response.status !== 200) {
                // Reaction might have been removed (toggle)
                await loadGroupMessages(currentGroupId);
            }
        }
    } catch (error) {
        console.error('Error adding group message reaction:', error);
    }
}

// Group menu functions
function showGroupMenu() {
    const dropdown = document.getElementById('groupMenuDropdown');
    dropdown.classList.toggle('hidden');
    
    // Close dropdown when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closeDropdown(e) {
            if (!e.target.closest('#groupMenuBtn') && !e.target.closest('#groupMenuDropdown')) {
                dropdown.classList.add('hidden');
                document.removeEventListener('click', closeDropdown);
            }
        });
    }, 100);
}

// Show edit group modal
function showEditGroupModal() {
    if (!currentGroupInfo) return;
    
    document.getElementById('editGroupName').value = currentGroupInfo.name || '';
    document.getElementById('editGroupDescription').value = currentGroupInfo.description || '';
    document.getElementById('editGroupMessage').textContent = '';
    document.getElementById('editGroupMessage').className = 'message';
    document.getElementById('groupMenuDropdown').classList.add('hidden');
    document.getElementById('editGroupModal').classList.remove('hidden');
}

// Hide edit group modal
function hideEditGroupModal() {
    document.getElementById('editGroupModal').classList.add('hidden');
}

// Handle update group
async function handleUpdateGroup(e) {
    e.preventDefault();
    
    const name = document.getElementById('editGroupName').value.trim();
    const description = document.getElementById('editGroupDescription').value.trim();
    const messageEl = document.getElementById('editGroupMessage');
    
    if (!name) {
        showError('editGroupMessage', 'Group name is required');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/groups/${currentGroupId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                name: name,
                description: description || null
            })
        });
        
        if (response.ok) {
            const group = await response.json();
            currentGroupInfo = group;
            document.getElementById('groupChatName').textContent = group.name;
            hideEditGroupModal();
            showSuccess('Group updated successfully');
            await loadGroupInfo(currentGroupId);
            await loadGroups(); // Refresh groups list
        } else {
            const data = await response.json();
            showError('editGroupMessage', data.detail || 'Failed to update group');
        }
    } catch (error) {
        console.error('Error updating group:', error);
        showError('editGroupMessage', 'Failed to update group. Please try again.');
    }
}

// Show upload group avatar modal
function showUploadGroupAvatarModal() {
    document.getElementById('groupAvatarInput').value = '';
    document.getElementById('groupAvatarPreviewImg').style.display = 'none';
    document.getElementById('uploadGroupAvatarMessage').textContent = '';
    document.getElementById('uploadGroupAvatarMessage').className = 'message';
    document.getElementById('groupMenuDropdown').classList.add('hidden');
    document.getElementById('uploadGroupAvatarModal').classList.remove('hidden');
}

// Hide upload group avatar modal
function hideUploadGroupAvatarModal() {
    document.getElementById('uploadGroupAvatarModal').classList.add('hidden');
}

// Handle group avatar select
function handleGroupAvatarSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        const previewImg = document.getElementById('groupAvatarPreviewImg');
        previewImg.src = event.target.result;
        previewImg.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

// Upload group avatar
async function uploadGroupAvatar() {
    const fileInput = document.getElementById('groupAvatarInput');
    const file = fileInput.files[0];
    
    if (!file) {
        showError('uploadGroupAvatarMessage', 'Please select an image');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch(`${API_BASE}/groups/${currentGroupId}/avatar`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` },
            body: formData
        });
        
        if (response.ok) {
            const group = await response.json();
            currentGroupInfo = group;
            
            // Update avatar display
            const avatarImgEl = document.getElementById('groupChatAvatarImg');
            const avatarEl = document.getElementById('groupChatAvatar');
            if (group.avatar) {
                avatarImgEl.src = `/uploads/${group.avatar}`;
                avatarImgEl.style.display = 'block';
                avatarEl.style.display = 'none';
            }
            
            hideUploadGroupAvatarModal();
            showSuccess('Group avatar updated successfully');
            await loadGroupInfo(currentGroupId);
            await loadGroups(); // Refresh groups list
        } else {
            const data = await response.json();
            showError('uploadGroupAvatarMessage', data.detail || 'Failed to upload avatar');
        }
    } catch (error) {
        console.error('Error uploading group avatar:', error);
        showError('uploadGroupAvatarMessage', 'Failed to upload avatar. Please try again.');
    }
}

// Show delete group confirm
function showDeleteGroupConfirm() {
    document.getElementById('groupMenuDropdown').classList.add('hidden');
    
    if (confirm('Are you sure you want to delete this group? This action cannot be undone.')) {
        deleteGroup();
    }
}

// Delete group
async function deleteGroup() {
    if (!currentGroupId) return;
    
    try {
        const response = await fetch(`${API_BASE}/groups/${currentGroupId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            showSuccess('Group deleted successfully');
            // Go back to groups list
            document.getElementById('groupChatView').classList.add('hidden');
            switchView('chat');
            switchChatTab('groups');
            await loadGroups();
        } else {
            const data = await response.json();
            showError(data.detail || 'Failed to delete group');
        }
    } catch (error) {
        console.error('Error deleting group:', error);
        showError('Failed to delete group. Please try again.');
    }
}

// Leave group
async function leaveGroup() {
    if (!currentGroupId) return;
    
    document.getElementById('groupMenuDropdown').classList.add('hidden');
    
    if (!confirm('Are you sure you want to leave this group?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/groups/${currentGroupId}/leave`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            showSuccess('Left group successfully');
            // Go back to groups list
            document.getElementById('groupChatView').classList.add('hidden');
            switchView('chat');
            switchChatTab('groups');
            await loadGroups();
        } else {
            const data = await response.json();
            showError(data.detail || 'Failed to leave group');
        }
    } catch (error) {
        console.error('Error leaving group:', error);
        showError('Failed to leave group. Please try again.');
    }
}

// Start group call (placeholder - will implement WebRTC group call later)
function startGroupCall(type) {
    showSuccess(`Group ${type} call feature will be implemented soon`);
    // TODO: Implement WebRTC group call
}

// Search users
async function searchUsers(query) {
    if (isLoggedOut || !accessToken) {
        return;
    }
    
    try {
        const controller = new AbortController();
        abortControllers.push(controller);
        
        const response = await fetch(`${API_BASE}/users/list?search=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            signal: controller.signal
        });
        
        // Remove controller from list after request completes
        abortControllers = abortControllers.filter(c => c !== controller);
        
        if (response.ok) {
            const users = await response.json();
            displaySearchResults(users);
        } else if (response.status === 401) {
            // Token expired, logout
            handleLogout();
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('Request aborted');
            return;
        }
        console.error('Error searching users:', error);
    }
}

// Display search results
function displaySearchResults(users) {
    const container = document.getElementById('searchResults');
    const recentSearches = document.getElementById('recentSearches');
    
    // Hide recent searches when showing search results
    if (recentSearches) {
        recentSearches.classList.add('hidden');
    }
    
    if (container) {
        container.classList.remove('hidden');
    container.innerHTML = '';
    
    if (users.length === 0) {
        container.innerHTML = `
            <div class="empty-search-state">
                <i class="fas fa-user-slash"></i>
                <p>No users found</p>
            </div>
        `;
        return;
    }
    
    users.forEach(user => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.addEventListener('click', () => showUserProfile(user.id));
        
        const avatarUrl = user.profile_pic 
            ? `/uploads/${user.profile_pic}` 
            : '/static/default-avatar.png';
        
        item.innerHTML = `
            <img src="${avatarUrl}" alt="${user.username}" class="avatar-small"
                 onerror="this.src='/static/default-avatar.png'">
            <div class="conversation-info">
                <div class="conversation-name">${user.username}</div>
                <div class="conversation-preview">${user.first_name || ''} ${user.last_name || ''}</div>
            </div>
        `;
        
        container.appendChild(item);
    });
    }
}

function clearSearchResults() {
    const container = document.getElementById('searchResults');
    if (container) {
    container.innerHTML = `
        <div class="empty-search-state">
            <i class="fas fa-search"></i>
            <p>Search for users by username</p>
        </div>
    `;
        // Don't hide it here - let loadRecentSearches handle visibility
    }
}

// Recent searches functions
function getRecentSearches() {
    try {
        const recent = localStorage.getItem('recentSearches');
        return recent ? JSON.parse(recent) : [];
    } catch (error) {
        console.error('Error getting recent searches:', error);
        return [];
    }
}

function saveRecentSearches(searches) {
    try {
        localStorage.setItem('recentSearches', JSON.stringify(searches));
    } catch (error) {
        console.error('Error saving recent searches:', error);
    }
}

function addToRecentSearches(user) {
    if (!user || !user.id) {
        console.warn('Cannot add to recent searches: user or user.id is missing', user);
        return;
    }
    
    let recent = getRecentSearches();
    console.log('Adding user to recent searches:', user.username, 'Current recent:', recent.length);
    
    // Remove if already exists
    recent = recent.filter(u => u.id !== user.id);
    
    // Add to beginning
    recent.unshift({
        id: user.id,
        username: user.username,
        profile_pic: user.profile_pic,
        first_name: user.first_name,
        last_name: user.last_name
    });
    
    // Keep only last 10
    if (recent.length > 10) {
        recent = recent.slice(0, 10);
    }
    
    saveRecentSearches(recent);
    console.log('Saved recent searches:', recent.length);
}

function loadRecentSearches() {
    const recentSearches = document.getElementById('recentSearches');
    const recentSearchesList = document.getElementById('recentSearchesList');
    const searchResults = document.getElementById('searchResults');
    
    if (!recentSearches || !recentSearchesList) {
        console.error('Recent searches elements not found');
        return;
    }
    
    const recent = getRecentSearches();
    console.log('Loading recent searches:', recent);
    
    if (recent.length === 0) {
        recentSearches.classList.add('hidden');
        // Show empty search results if no recent searches
        if (searchResults) {
            searchResults.classList.remove('hidden');
        }
        return;
    }
    
    // Hide search results and show recent searches
    if (searchResults) {
        searchResults.classList.add('hidden');
    }
    recentSearches.classList.remove('hidden');
    
    // Clear and populate recent searches list
    recentSearchesList.innerHTML = '';
    
    recent.forEach(user => {
        const item = document.createElement('div');
        item.className = 'recent-search-item';
        
        const avatarUrl = user.profile_pic 
            ? `/uploads/${user.profile_pic}` 
            : '/static/default-avatar.png';
        
        // Check if user is being followed (we'll need to fetch this)
        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
        
        item.innerHTML = `
            <div class="recent-search-content" data-user-id="${user.id}">
                <img src="${avatarUrl}" alt="${user.username}" class="avatar-small"
                     onerror="this.src='/static/default-avatar.png'">
                <div class="recent-search-info">
                    <div class="recent-search-username">${escapeHtml(user.username)}</div>
                    <div class="recent-search-name">${escapeHtml(fullName)}</div>
                </div>
            </div>
            <button class="recent-search-delete" data-user-id="${user.id}" title="Remove">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Click on item to open profile
        const content = item.querySelector('.recent-search-content');
        content.addEventListener('click', () => {
            showUserProfile(user.id);
        });
        
        // Click on delete button to remove
        const deleteBtn = item.querySelector('.recent-search-delete');
        deleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeFromRecentSearches(user.id);
        });
        
        recentSearchesList.appendChild(item);
    });
}

function removeFromRecentSearches(userId) {
    let recent = getRecentSearches();
    recent = recent.filter(u => u.id !== userId);
    saveRecentSearches(recent);
    loadRecentSearches();
}

function clearAllRecentSearches() {
    saveRecentSearches([]);
    loadRecentSearches();
}

// Show user profile
async function showUserProfile(userId) {
    if (isLoggedOut || !accessToken) {
        return;
    }
    
    try {
        const controller = new AbortController();
        abortControllers.push(controller);
        
        const response = await fetch(`${API_BASE}/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            signal: controller.signal
        });
        
        // Remove controller from list after request completes
        abortControllers = abortControllers.filter(c => c !== controller);
        
        if (response.ok) {
            const user = await response.json();
            
            // Add to recent searches
            addToRecentSearches(user);
            
            // Get follow status
            const followController = new AbortController();
            abortControllers.push(followController);
            
            const followResponse = await fetch(`${API_BASE}/users/${userId}/follow-status`, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                signal: followController.signal
            });
            
            // Remove controller from list after request completes
            abortControllers = abortControllers.filter(c => c !== followController);
            const followStatus = followResponse.ok ? await followResponse.json() : { following: false };
            
            // Hide all views and show user profile
            document.querySelectorAll('.view-container').forEach(v => {
                v.classList.add('hidden');
                v.classList.remove('active');
            });
            document.getElementById('userProfileView').classList.remove('hidden');
            document.getElementById('userProfileView').classList.add('active');
            
            // Populate profile
            document.getElementById('userProfileAvatar').src = user.profile_pic 
                ? `/uploads/${user.profile_pic}` 
                : '/static/default-avatar.png';
            document.getElementById('userProfileUsername').textContent = user.username;
            document.getElementById('userProfileName').textContent = 
                `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
            document.getElementById('userProfileBio').textContent = user.bio || 'No bio';
            
            // Update follow button
            const followBtn = document.getElementById('followBtn');
            if (followStatus.following) {
                followBtn.innerHTML = '<i class="fas fa-user-check"></i> Following';
                followBtn.dataset.following = 'true';
            } else {
                followBtn.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
                followBtn.dataset.following = 'false';
            }
            followBtn.dataset.userId = userId;
            
            // Store user ID for message button
            document.getElementById('messageUserBtn').dataset.userId = userId;
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
    }
}

// Handle follow user
async function handleFollowUser() {
    const btn = document.getElementById('followBtn');
    const userId = parseInt(btn.dataset.userId);
    const isFollowing = btn.dataset.following === 'true';
    
    try {
        const url = `${API_BASE}/users/${userId}/${isFollowing ? 'follow' : 'follow'}`;
        const method = isFollowing ? 'DELETE' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            if (isFollowing) {
                btn.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
                btn.dataset.following = 'false';
            } else {
                btn.innerHTML = '<i class="fas fa-user-check"></i> Following';
                btn.dataset.following = 'true';
            }
        }
    } catch (error) {
        console.error('Error following/unfollowing user:', error);
    }
}

// Handle message user
function handleMessageUser() {
    const btn = document.getElementById('messageUserBtn');
    if (!btn || !btn.dataset.userId) return;
    
    const userId = parseInt(btn.dataset.userId);
    
    // Get user info and open chat directly (don't switch to chat list view)
    fetch(`${API_BASE}/users/${userId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    .then(res => res.json())
    .then(user => {
        // Open chat directly without switching to chat list view
        openChat(user.id, user.username, user.profile_pic);
        // Don't call switchView('chat') - we want to stay in chat view
    })
    .catch(err => {
        console.error('Error opening chat:', err);
        showError('profileMessage', 'Failed to open chat');
    });
}

// Refresh access token
async function refreshAccessToken() {
    if (!refreshToken) {
        console.warn('No refresh token available');
        return false;
    }
    
    try {
        const response = await fetch(`${API_BASE}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken })
        });
        
        if (response.ok) {
            const data = await response.json();
            accessToken = data.access_token;
            if (data.refresh_token) {
                refreshToken = data.refresh_token;
            }
            localStorage.setItem('accessToken', accessToken);
            if (refreshToken) {
                localStorage.setItem('refreshToken', refreshToken);
            }
            console.log('Token refreshed successfully');
            return true;
        } else {
            console.error('Token refresh failed:', response.status);
            return false;
        }
    } catch (error) {
        console.error('Error refreshing token:', error);
        return false;
    }
}

// Load user profile
async function loadUserProfile() {
    if (!accessToken) {
        console.warn('No access token available');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/users/me`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.status === 401) {
            // Token expired or invalid, try to refresh
            console.log('Token expired, attempting refresh...');
            const refreshed = await refreshAccessToken();
            if (refreshed) {
                // Retry with new token
                const retryResponse = await fetch(`${API_BASE}/users/me`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (retryResponse.ok) {
                    const user = await retryResponse.json();
                    currentUser = user;
                    // Update profile display
                    document.getElementById('profileAvatar').src = user.profile_pic 
                        ? `/uploads/${user.profile_pic}` 
                        : '/static/default-avatar.png';
                    document.getElementById('profileUsername').textContent = user.username;
                    document.getElementById('profileName').textContent = 
                        `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
                    document.getElementById('profileBio').textContent = user.bio || 'No bio';
                    
                    // Update desktop sidebar
                    if (document.getElementById('desktopUserAvatar')) {
                        document.getElementById('desktopUserAvatar').src = user.profile_pic 
                            ? `/uploads/${user.profile_pic}` 
                            : '/static/default-avatar.png';
                        document.getElementById('desktopUserName').textContent = user.username;
                    }
                    return;
                }
            }
            // Refresh failed, clear tokens and show login
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            accessToken = null;
            refreshToken = null;
            isLoggedOut = true;
            showLoginScreen();
            throw new Error('Authentication failed');
        }
        
        if (response.ok) {
            const user = await response.json();
            currentUser = user;
            
            // Update admin nav visibility
            updateAdminNavVisibility();
            
            // Update profile display
            document.getElementById('profileAvatar').src = user.profile_pic 
                ? `/uploads/${user.profile_pic}` 
                : '/static/default-avatar.png';
            document.getElementById('profileUsername').textContent = user.username;
            document.getElementById('profileName').textContent = 
                `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
            document.getElementById('profileBio').textContent = user.bio || 'No bio';
            
            // Load followers and following counts
            loadFollowersCount(user.id);
            loadFollowingCount(user.id);
            
            // Update form fields
            document.getElementById('profileUsernameInput').value = user.username || '';
            document.getElementById('profileFirstName').value = user.first_name || '';
            document.getElementById('profileLastName').value = user.last_name || '';
            document.getElementById('profileBioInput').value = user.bio || '';
            
            // Update desktop sidebar
            if (document.getElementById('desktopUserAvatar')) {
                document.getElementById('desktopUserAvatar').src = user.profile_pic 
                    ? `/uploads/${user.profile_pic}` 
                    : '/static/default-avatar.png';
                document.getElementById('desktopUserName').textContent = user.username;
            }
            
            // Update mobile nav profile image
            const navProfileImg = document.getElementById('navProfileImg');
            if (navProfileImg) {
                navProfileImg.src = user.profile_pic 
                    ? `/uploads/${user.profile_pic}` 
                    : '/static/default-avatar.png';
            }
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

// Toggle notifications
async function toggleNotifications() {
    const btn = document.getElementById('enableNotificationsBtn');
    
    if ('Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            btn.classList.add('active');
            showSuccess('Notifications enabled');
        }
    } else if (Notification.permission === 'granted') {
        btn.classList.add('active');
    } else {
        btn.classList.remove('active');
    }
}

// Load users
async function loadUsers(search = '') {
    try {
        console.log('Loading users with token:', accessToken ? 'present' : 'missing');
        const url = search 
            ? `${API_BASE}/users/list?search=${encodeURIComponent(search)}`
            : `${API_BASE}/users/list`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (!response.ok) {
            console.error('Failed to load users:', response.status, response.statusText);
            const errorData = await response.json().catch(() => ({}));
            console.error('Error details:', errorData);
            
            // Show error message to user
            const userList = document.getElementById('userList');
            if (userList) {
                userList.innerHTML = '<div class="error-message">Failed to load users. Please refresh.</div>';
            }
            return;
        }
        
        const users = await response.json();
        const currentUserId = currentUser.id;
        const otherUsers = users.filter(u => u.id !== currentUserId);
        
        const userList = document.getElementById('userList');
        if (!userList) return;
        
        userList.innerHTML = '';
        
        if (otherUsers.length === 0) {
            userList.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">No other users found</div>';
            return;
        }
        
        otherUsers.forEach(user => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            userItem.dataset.userId = user.id;
            
            // Handle missing profile_pic gracefully
            const avatarUrl = user.profile_pic 
                ? `/uploads/${user.profile_pic}` 
                : '/static/default-avatar.png';
            
            userItem.innerHTML = `
                <div class="user-avatar">
                    <img src="${avatarUrl}" 
                         alt="${user.username}" class="avatar-small"
                         onerror="this.src='/static/default-avatar.png'">
                    <span class="status-indicator"></span>
                </div>
                <div class="user-details">
                    <div class="user-name">${user.username}</div>
                    <div class="last-message">Click to start chatting</div>
                </div>
            `;
            userItem.addEventListener('click', () => openChat(user.id, user.username, user.profile_pic));
            userList.appendChild(userItem);
        });
    } catch (error) {
        console.error('Error loading users:', error);
        const userList = document.getElementById('userList');
        if (userList) {
            userList.innerHTML = '<div class="error-message">Error loading users. Please check console.</div>';
        }
    }
}

// Open chat
function openChat(userId, username, avatar) {
    currentChatUserId = userId;
    
    // Hide all views and show chat view
    document.querySelectorAll('.view-container').forEach(v => {
        v.classList.add('hidden');
        v.classList.remove('active');
    });
    document.getElementById('chatView').classList.remove('hidden');
    document.getElementById('chatView').classList.add('active');
    
    document.getElementById('chatUserName').textContent = username;
    document.getElementById('chatUserAvatar').src = avatar ? `/uploads/${avatar}` : '/static/default-avatar.png';
    
    loadChatHistory(userId);
}

// Load chat history
async function loadChatHistory(userId) {
    try {
        const response = await fetch(`${API_BASE}/messages/${userId}?limit=50`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            const messages = await response.json();
            displayMessages(messages);
        }
    } catch (error) {
        console.error('Error loading chat history:', error);
    }
}

// Display messages
function displayMessages(messages) {
    const container = document.getElementById('chatMessages');
    container.innerHTML = '';
    
    messages.forEach(msg => {
        if (msg.is_deleted) {
            const msgEl = document.createElement('div');
            msgEl.className = `message-item deleted ${msg.sender_id === currentUser.id ? 'own' : ''}`;
            msgEl.innerHTML = `
                <div class="message-bubble deleted-message">
                    <i class="fas fa-trash"></i> This message was deleted
                </div>
            `;
            container.appendChild(msgEl);
            return;
        }
        
        const isOwn = msg.sender_id === currentUser.id;
        const msgEl = document.createElement('div');
        msgEl.className = `message-item ${isOwn ? 'own' : ''}`;
        msgEl.dataset.messageId = msg.id;
        
        let messageContent = '';
        if (msg.message_type === 'image' && msg.attachment) {
            messageContent = `<img src="/uploads/${msg.attachment}" alt="Image" class="message-image" onclick="openImageModal('/uploads/${msg.attachment}')">`;
        } else if (msg.message_type === 'video' && msg.attachment) {
            messageContent = `<video src="/uploads/${msg.attachment}" controls class="message-video"></video>`;
        } else if (msg.message_type === 'circular_video' && msg.attachment) {
            messageContent = `<video src="/uploads/${msg.attachment}" controls class="message-video circular-video"></video>`;
        } else if (msg.message_type === 'location' && msg.location_lat && msg.location_lng) {
            messageContent = `
                <div class="message-location">
                    <i class="fas fa-map-marker-alt"></i>
                    <a href="https://www.google.com/maps?q=${msg.location_lat},${msg.location_lng}" target="_blank">
                        View Location
                    </a>
                    <div class="location-map">
                        <iframe 
                            src="https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dP9Jb3w&q=${msg.location_lat},${msg.location_lng}"
                            width="100%" height="200" frameborder="0" style="border:0;" allowfullscreen>
                        </iframe>
                    </div>
                </div>
            `;
        }
        
        if (msg.content) {
            messageContent += `<div class="message-text">${escapeHtml(msg.content)}</div>`;
        }
        
        // Reactions display
        let reactionsHtml = '';
        if (msg.reactions && msg.reactions.length > 0) {
            const reactionsByType = {};
            msg.reactions.forEach(r => {
                const emoji = getReactionEmoji(r.reaction_type);
                if (!reactionsByType[r.reaction_type]) {
                    reactionsByType[r.reaction_type] = { count: 0, users: [] };
                }
                reactionsByType[r.reaction_type].count++;
                reactionsByType[r.reaction_type].users.push(r.user.username);
            });
            
            reactionsHtml = '<div class="message-reactions">';
            Object.entries(reactionsByType).forEach(([type, data]) => {
                reactionsHtml += `<span class="reaction-badge" title="${data.users.join(', ')}">${getReactionEmoji(type)} ${data.count}</span>`;
            });
            reactionsHtml += '</div>';
        }
        
        msgEl.innerHTML = `
            <img src="${isOwn ? (currentUser.profile_pic ? `/uploads/${currentUser.profile_pic}` : '/static/default-avatar.png') : 
                      (msg.sender.profile_pic ? `/uploads/${msg.sender.profile_pic}` : '/static/default-avatar.png')}" 
                 alt="Avatar" class="avatar-small">
            <div class="message-bubble">
                ${messageContent}
                ${reactionsHtml}
                <div class="message-time">
                    ${formatTime(msg.created_at)}
                    ${msg.edited_at ? '<span class="edited-badge">(edited)</span>' : ''}
                </div>
                ${isOwn ? '<button class="message-menu-btn" onclick="showMessageMenu(event, ' + msg.id + ')"><i class="fas fa-ellipsis-v"></i></button>' : ''}
            </div>
        `;
        
        if (isOwn) {
            msgEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showMessageMenu(e, msg.id);
            });
        }
        
        // Allow double-click to react on any message
        msgEl.addEventListener('dblclick', (e) => {
            e.preventDefault();
            reactingMessageId = msg.id;
            const rect = msgEl.getBoundingClientRect();
            showReactionPickerAt(rect.left + rect.width / 2, rect.top - 60);
        });
        
        container.appendChild(msgEl);
    });
    
    container.scrollTop = container.scrollHeight;
}

function getReactionEmoji(type) {
    const emojis = {
        'like': '👍',
        'love': '❤️',
        'laugh': '😂',
        'wow': '😮',
        'sad': '😢',
        'angry': '😠'
    };
    return emojis[type] || '👍';
}

function showMessageMenu(event, messageId) {
    const menu = document.getElementById('messageContextMenu');
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    menu.classList.remove('hidden');
    editingMessageId = messageId;
    reactingMessageId = messageId;
}

function openImageModal(src) {
    // Simple modal for image viewing
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = `
        <div class="image-modal-content">
            <button class="close-modal" onclick="this.parentElement.parentElement.remove()">×</button>
            <img src="${src}" alt="Full size">
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// Send message
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    
    if ((!content && !pendingMedia.type) || !currentChatUserId) return;
    
    let attachment = null;
    let messageType = 'text';
    let locationLat = null;
    let locationLng = null;
    
    // Handle media upload
    if (pendingMedia.type) {
        if (pendingMedia.type === 'location') {
            messageType = 'location';
            locationLat = pendingMedia.location.lat;
            locationLng = pendingMedia.location.lng;
        } else {
            // Upload file first
            try {
                const formData = new FormData();
                formData.append('file', pendingMedia.file);
                formData.append('message_type', pendingMedia.type);
                
                const uploadResponse = await fetch(`${API_BASE}/messages/upload?message_type=${pendingMedia.type}`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${accessToken}` },
                    body: formData
                });
                
                if (uploadResponse.ok) {
                    const uploadData = await uploadResponse.json();
                    attachment = uploadData.filename;
                    messageType = pendingMedia.type;
                } else {
                    showError('profileMessage', 'Failed to upload media');
                    return;
                }
            } catch (error) {
                console.error('Error uploading media:', error);
                showError('profileMessage', 'Failed to upload media');
                return;
            }
        }
    }
    
    // Clear input and media preview immediately for better UX
    const messageContent = content;
    const messageAttachment = attachment;
    const messageMessageType = messageType;
    const messageLocationLat = locationLat;
    const messageLocationLng = locationLng;
    
    input.value = '';
    removeMediaPreview();
    
    // Create temporary message ID for optimistic update
    const tempMessageId = `temp_${Date.now()}_${++messageIdCounter}`;
    
    // Create optimistic message object
    const optimisticMessage = {
        id: tempMessageId,
        sender_id: currentUser.id,
        from: currentUser.id,
        content: messageContent || null,
        attachment: messageAttachment,
        message_type: messageMessageType,
        location_lat: messageLocationLat,
        location_lng: messageLocationLng,
        sender: {
            id: currentUser.id,
            username: currentUser.username,
            profile_pic: currentUser.profile_pic,
            first_name: currentUser.first_name,
            last_name: currentUser.last_name
        },
        created_at: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        isOptimistic: true // Flag to identify optimistic messages
    };
    
    // Store pending message
    pendingMessages.set(tempMessageId, {
        message: optimisticMessage,
        timestamp: Date.now()
    });
    
    // Add message immediately to UI (optimistic update)
    addMessageToChat(optimisticMessage);
    
    // Send via WebSocket
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        try {
        wsConnection.send(JSON.stringify({
            type: 'message',
            to: currentChatUserId,
                content: messageContent || null,
                attachment: messageAttachment,
                message_type: messageMessageType,
                location_lat: messageLocationLat,
                location_lng: messageLocationLng,
                temp_id: tempMessageId // Send temp ID to match later
            }));
        } catch (error) {
            console.error('Error sending message via WebSocket:', error);
            // Remove optimistic message on error
            removeOptimisticMessage(tempMessageId);
            showError('profileMessage', 'Failed to send message. Please try again.');
            // Restore input
            input.value = messageContent;
        }
    } else {
        // If WebSocket is not connected, remove optimistic message and show error
        removeOptimisticMessage(tempMessageId);
        showError('profileMessage', 'Connection lost. Please refresh the page.');
        // Restore input
        input.value = messageContent;
    }
}

// Remove optimistic message from UI
function removeOptimisticMessage(tempId) {
    const container = document.getElementById('chatMessages');
    if (container) {
        const msgEl = container.querySelector(`[data-message-id="${tempId}"]`);
        if (msgEl) {
            msgEl.remove();
        }
    }
    pendingMessages.delete(tempId);
}

// Replace optimistic message with real message
function replaceOptimisticMessage(tempId, realMessage) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    
    const msgEl = container.querySelector(`[data-message-id="${tempId}"]`);
    if (msgEl) {
        // Remove old message
        msgEl.remove();
    }
    
    // Add real message (skip duplicate check since we're replacing)
    const senderId = realMessage.sender_id || realMessage.from;
    const isOwn = senderId === currentUser.id;
    
    if (senderId) {
        const newMsgEl = document.createElement('div');
        newMsgEl.className = `message-item ${isOwn ? 'own' : ''}`;
        newMsgEl.dataset.messageId = realMessage.id;
        
        let messageContent = '';
        if (realMessage.message_type === 'image' && realMessage.attachment) {
            messageContent = `<img src="/uploads/${realMessage.attachment}" alt="Image" class="message-image" onclick="openImageModal('/uploads/${realMessage.attachment}')">`;
        } else if (realMessage.message_type === 'video' && realMessage.attachment) {
            messageContent = `<video src="/uploads/${realMessage.attachment}" controls class="message-video"></video>`;
        } else if (realMessage.message_type === 'circular_video' && realMessage.attachment) {
            messageContent = `<video src="/uploads/${realMessage.attachment}" controls class="message-video circular-video"></video>`;
        } else if (realMessage.message_type === 'location' && realMessage.location_lat && realMessage.location_lng) {
            messageContent = `
                <div class="message-location">
                    <i class="fas fa-map-marker-alt"></i>
                    <a href="https://www.google.com/maps?q=${realMessage.location_lat},${realMessage.location_lng}" target="_blank">
                        View Location
                    </a>
                    <div class="location-map">
                        <iframe 
                            src="https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dP9Jb3w&q=${realMessage.location_lat},${realMessage.location_lng}"
                            width="100%" height="200" frameborder="0" style="border:0;" allowfullscreen>
                        </iframe>
                    </div>
                </div>
            `;
        }
        
        if (realMessage.content) {
            messageContent += `<div class="message-text">${escapeHtml(realMessage.content)}</div>`;
        }
        
        const sender = realMessage.sender || currentUser;
        const senderAvatar = sender.profile_pic ? `/uploads/${sender.profile_pic}` : '/static/default-avatar.png';
        const currentUserAvatar = currentUser.profile_pic ? `/uploads/${currentUser.profile_pic}` : '/static/default-avatar.png';
        
        newMsgEl.innerHTML = `
            <img src="${isOwn ? currentUserAvatar : senderAvatar}" 
                 alt="Avatar" class="avatar-small">
            <div class="message-bubble">
                ${messageContent}
                <div class="message-time">
                    ${formatTime(realMessage.timestamp || realMessage.created_at || new Date().toISOString())}
                </div>
                ${isOwn ? '<button class="message-menu-btn" onclick="showMessageMenu(event, ' + realMessage.id + ')"><i class="fas fa-ellipsis-v"></i></button>' : ''}
            </div>
        `;
        
        if (isOwn) {
            newMsgEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showMessageMenu(e, realMessage.id);
            });
        }
        
        container.appendChild(newMsgEl);
        container.scrollTop = container.scrollHeight;
    }
    
    // Remove from pending
    pendingMessages.delete(tempId);
    
    // Update conversations list
    clearTimeout(window.conversationUpdateTimeout);
    window.conversationUpdateTimeout = setTimeout(() => {
        loadConversations();
    }, 500);
}

// Clean up old pending messages (older than 30 seconds)
function cleanupPendingMessages() {
    const now = Date.now();
    for (const [tempId, pending] of pendingMessages.entries()) {
        if (now - pending.timestamp > 30000) { // 30 seconds
            removeOptimisticMessage(tempId);
        }
    }
}

// Clean up pending messages periodically
setInterval(cleanupPendingMessages, 10000); // Every 10 seconds

// Media handlers
async function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showError('profileMessage', 'Please select an image file');
        return;
    }
    
    pendingMedia = { type: 'image', file: file, url: URL.createObjectURL(file), location: null };
    showMediaPreview('image', URL.createObjectURL(file));
}

async function handleVideoSelect(e, type) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('video/')) {
        showError('profileMessage', 'Please select a video file');
        return;
    }
    
    pendingMedia = { type: type, file: file, url: URL.createObjectURL(file), location: null };
    showMediaPreview('video', URL.createObjectURL(file));
}

function getCurrentLocation() {
    if (!navigator.geolocation) {
        showError('profileMessage', 'Geolocation is not supported by your browser');
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            pendingMedia = {
                type: 'location',
                file: null,
                url: null,
                location: {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                }
            };
            showLocationPreview(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
            showError('profileMessage', 'Failed to get location');
        }
    );
}

function showMediaPreview(type, url) {
    const preview = document.getElementById('mediaPreview');
    const previewImage = document.getElementById('previewImage');
    const previewVideo = document.getElementById('previewVideo');
    
    if (!preview || !previewImage || !previewVideo) {
        console.error('Media preview elements not found');
        return;
    }
    
    preview.classList.remove('hidden');
    
    if (type === 'image') {
        previewImage.src = url;
        previewImage.classList.remove('hidden');
        previewVideo.classList.add('hidden');
    } else {
        previewVideo.src = url;
        previewVideo.classList.remove('hidden');
        previewImage.classList.add('hidden');
    }
}

function showLocationPreview(lat, lng) {
    const preview = document.getElementById('mediaPreview');
    if (!preview) {
        console.error('Media preview element not found');
        return;
    }
    
    preview.innerHTML = `
        <div class="media-preview-item">
            <div class="location-preview">
                <i class="fas fa-map-marker-alt"></i>
                <span>Location: ${lat.toFixed(6)}, ${lng.toFixed(6)}</span>
            </div>
            <button class="btn-remove-media" id="removeMediaBtn">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    preview.classList.remove('hidden');
    
    const removeBtn = document.getElementById('removeMediaBtn');
    if (removeBtn) {
        removeBtn.addEventListener('click', removeMediaPreview);
    }
}

function removeMediaPreview() {
    const preview = document.getElementById('mediaPreview');
    const previewImage = document.getElementById('previewImage');
    const previewVideo = document.getElementById('previewVideo');
    
    if (preview) {
        preview.classList.add('hidden');
    }
    if (previewImage) {
        previewImage.classList.add('hidden');
    }
    if (previewVideo) {
        previewVideo.classList.add('hidden');
    }
    
    if (pendingMedia.url) {
        URL.revokeObjectURL(pendingMedia.url);
    }
    pendingMedia = { type: null, file: null, url: null, location: null };
    
    const imageInput = document.getElementById('imageInput');
    const videoInput = document.getElementById('videoInput');
    const circularVideoInput = document.getElementById('circularVideoInput');
    
    if (imageInput) imageInput.value = '';
    if (videoInput) videoInput.value = '';
    if (circularVideoInput) circularVideoInput.value = '';
}

// Message CRUD handlers
async function handleEditMessage() {
    if (!editingMessageId) return;
    
    const messageEl = document.querySelector(`[data-message-id="${editingMessageId}"]`);
    if (!messageEl) return;
    
    const messageText = messageEl.querySelector('.message-text');
    if (!messageText) return;
    
    const currentText = messageText.textContent;
    
    // Hide context menu
    document.getElementById('messageContextMenu').classList.add('hidden');
    
    // Replace message text with input field
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentText;
    input.className = 'message-edit-input';
    input.style.cssText = 'width: 100%; padding: 4px 8px; border: 1px solid var(--primary-color); border-radius: 4px; font-size: 14px;';
    
    // Replace text with input
    messageText.parentNode.replaceChild(input, messageText);
    input.focus();
    input.select();
    
    // Handle save on Enter or blur
    const saveEdit = async () => {
        const newText = input.value.trim();
        if (newText === currentText || !newText) {
            // Cancel edit - restore original
            const textDiv = document.createElement('div');
            textDiv.className = 'message-text';
            textDiv.textContent = currentText;
            input.parentNode.replaceChild(textDiv, input);
            return;
        }
        
        // Optimistically update UI
                const textDiv = document.createElement('div');
                textDiv.className = 'message-text';
        textDiv.textContent = newText;
                input.parentNode.replaceChild(textDiv, input);
        
        // Update time to show edited badge
        const messageBubble = messageEl.querySelector('.message-bubble');
        if (messageBubble) {
            const messageTime = messageBubble.querySelector('.message-time');
            if (messageTime) {
                const editedBadge = messageTime.querySelector('.edited-badge') || document.createElement('span');
                editedBadge.className = 'edited-badge';
                editedBadge.textContent = '(edited)';
                if (!messageTime.querySelector('.edited-badge')) {
                    messageTime.appendChild(editedBadge);
                }
            }
        }
        
        // Send via WebSocket if available
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            try {
                wsConnection.send(JSON.stringify({
                    type: 'edit_message',
                    message_id: editingMessageId,
                    content: newText
                }));
        } catch (error) {
                console.error('Error sending edit via WebSocket:', error);
                // Fallback to HTTP
                editMessageViaHTTP(editingMessageId, newText, currentText, messageEl);
            }
        } else {
            // Fallback to HTTP
            editMessageViaHTTP(editingMessageId, newText, currentText, messageEl);
        }
    };
    
    input.addEventListener('blur', saveEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            const textDiv = document.createElement('div');
            textDiv.className = 'message-text';
            textDiv.textContent = currentText;
            input.parentNode.replaceChild(textDiv, input);
        }
    });
}

// Fallback HTTP method for editing
async function editMessageViaHTTP(messageId, newText, originalText, messageEl) {
    try {
        const response = await fetch(`${API_BASE}/messages/${messageId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ content: newText })
        });
        
        if (response.ok) {
            // Message already updated in UI, just reload to sync
            await loadChatHistory(currentChatUserId);
        } else {
            showError('profileMessage', 'Failed to edit message');
            // Restore original
            const messageText = messageEl.querySelector('.message-text');
            if (messageText) {
                messageText.textContent = originalText;
            }
        }
    } catch (error) {
        console.error('Error editing message:', error);
        showError('profileMessage', 'Failed to edit message');
        // Restore original
        const messageText = messageEl.querySelector('.message-text');
        if (messageText) {
            messageText.textContent = originalText;
        }
    }
}

async function handleDeleteMessage() {
    if (!editingMessageId || !currentChatUserId) return;
    
    // Hide context menu first
    document.getElementById('messageContextMenu').classList.add('hidden');
    
    if (!confirm('Are you sure you want to delete this message?')) {
        return;
    }
    
    const messageId = editingMessageId;
    
    // Optimistically update UI first
    updateMessageDeletedOptimistic(messageId);
    
    // Send via WebSocket if available
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        try {
            wsConnection.send(JSON.stringify({
                type: 'delete_message',
                message_id: messageId
            }));
            // Update conversations list
            clearTimeout(window.conversationUpdateTimeout);
            window.conversationUpdateTimeout = setTimeout(() => {
                loadConversations();
            }, 300);
        } catch (error) {
            console.error('Error sending delete via WebSocket:', error);
            // Fallback to HTTP
            deleteMessageViaHTTP(messageId);
        }
    } else {
        // Fallback to HTTP if WebSocket not available
        deleteMessageViaHTTP(messageId);
    }
}

// Optimistic update for delete (immediate UI update)
function updateMessageDeletedOptimistic(messageId) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    
    const messageEl = container.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageEl) return;
    
    // Replace message content with deleted message
    const messageBubble = messageEl.querySelector('.message-bubble');
    if (messageBubble) {
        messageBubble.className = 'message-bubble deleted-message';
        messageBubble.innerHTML = '<i class="fas fa-trash"></i> This message was deleted';
        
        // Remove menu button if exists
        const menuBtn = messageBubble.querySelector('.message-menu-btn');
        if (menuBtn) {
            menuBtn.remove();
        }
        
        // Remove reactions if exists
        const reactionsEl = messageBubble.querySelector('.message-reactions');
        if (reactionsEl) {
            reactionsEl.remove();
        }
        
        // Update time
        const messageTime = messageBubble.querySelector('.message-time');
        if (messageTime) {
            messageTime.innerHTML = formatTime(new Date().toISOString());
        }
    }
}

// Fallback HTTP method for delete
async function deleteMessageViaHTTP(messageId) {
    try {
        const response = await fetch(`${API_BASE}/messages/${messageId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            // Reload chat history to show deleted message
            await loadChatHistory(currentChatUserId);
            // Also reload conversations list
            loadConversations();
        } else {
            const errorData = await response.json().catch(() => ({}));
            showError('profileMessage', errorData.detail || 'Failed to delete message');
            // Restore message on error
            await loadChatHistory(currentChatUserId);
        }
    } catch (error) {
        console.error('Error deleting message:', error);
        showError('profileMessage', 'Failed to delete message');
        // Restore message on error
        await loadChatHistory(currentChatUserId);
    }
}

function showReactionPicker() {
    if (!reactingMessageId) {
        console.error('No message ID set for reaction');
        return;
    }
    
    const picker = document.getElementById('reactionPicker');
    const menu = document.getElementById('messageContextMenu');
    
    if (!picker || !menu) {
        console.error('Reaction picker or menu not found');
        return;
    }
    
    // Hide context menu first
    menu.classList.add('hidden');
    
    // Position picker near the menu
    const menuRect = menu.getBoundingClientRect();
    picker.style.left = (menuRect.left - 100) + 'px';
    picker.style.top = (menuRect.top - 60) + 'px';
    picker.classList.remove('hidden');
}

function showReactionPickerAt(x, y) {
    const picker = document.getElementById('reactionPicker');
    picker.style.left = (x - 120) + 'px'; // Center the picker
    picker.style.top = y + 'px';
    picker.classList.remove('hidden');
}

function hideReactionPicker() {
    document.getElementById('reactionPicker').classList.add('hidden');
}

async function addReactionToMessage(messageId, reactionType) {
    if (!messageId || !reactionType || !currentChatUserId) {
        console.error('Missing parameters:', { messageId, reactionType, currentChatUserId });
        return;
    }
    
    // Check if user already has this reaction (toggle behavior)
    const container = document.getElementById('chatMessages');
    if (container) {
        const messageEl = container.querySelector(`[data-message-id="${messageId}"]`);
        if (messageEl) {
            const reactionsEl = messageEl.querySelector('.message-reactions');
            if (reactionsEl) {
                // Check if user already reacted with this type
                // This is a simple check - real check should be done on server
                // For now, we'll let server handle toggle logic
            }
        }
    }
    
    // Send via WebSocket if available
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        try {
            // Optimistically update UI first
            updateMessageReactionOptimistic(messageId, reactionType);
            
            wsConnection.send(JSON.stringify({
                type: 'add_reaction',
                message_id: messageId,
                reaction_type: reactionType
            }));
        } catch (error) {
            console.error('Error sending reaction via WebSocket:', error);
            // Remove optimistic update on error
            // Fallback to HTTP
            addReactionViaHTTP(messageId, reactionType);
        }
    } else {
        // Fallback to HTTP if WebSocket not available
        addReactionViaHTTP(messageId, reactionType);
    }
}

// Optimistic update for reaction (immediate UI update)
function updateMessageReactionOptimistic(messageId, reactionType) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    
    const messageEl = container.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageEl) return;
    
    const messageBubble = messageEl.querySelector('.message-bubble');
    if (!messageBubble) return;
    
    let reactionsEl = messageBubble.querySelector('.message-reactions');
    if (!reactionsEl) {
        reactionsEl = document.createElement('div');
        reactionsEl.className = 'message-reactions';
        const messageTime = messageBubble.querySelector('.message-time');
        if (messageTime) {
            messageTime.parentNode.insertBefore(reactionsEl, messageTime);
        } else {
            messageBubble.appendChild(reactionsEl);
        }
    }
    
    // Get current reactions HTML
    let currentHtml = reactionsEl.innerHTML;
    const emoji = getReactionEmoji(reactionType);
    
    // Check if this reaction type already exists
    const reactionBadge = Array.from(reactionsEl.querySelectorAll('.reaction-badge')).find(badge => 
        badge.textContent.includes(emoji)
    );
    
    if (reactionBadge) {
        // Update existing reaction count (optimistic - will be corrected by server)
        const match = reactionBadge.textContent.match(/(\d+)/);
        if (match) {
            const currentCount = parseInt(match[1]);
            reactionBadge.textContent = `${emoji} ${currentCount + 1}`;
        }
    } else {
        // Add new reaction badge
        const newBadge = document.createElement('span');
        newBadge.className = 'reaction-badge';
        newBadge.textContent = `${emoji} 1`;
        reactionsEl.appendChild(newBadge);
    }
}

// Fallback HTTP method for reactions
async function addReactionViaHTTP(messageId, reactionType) {
    try {
        const response = await fetch(`${API_BASE}/messages/${messageId}/reactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ reaction_type: reactionType })
        });
        
        if (response.ok) {
            // Reload chat history to show updated reactions
            await loadChatHistory(currentChatUserId);
        } else {
            const errorData = await response.json().catch(() => ({}));
            console.error('Failed to add reaction:', errorData);
            showError('profileMessage', errorData.detail || 'Failed to add reaction');
        }
    } catch (error) {
        console.error('Error adding reaction:', error);
        showError('profileMessage', 'Failed to add reaction');
    }
}

// Update message reaction in UI (optimistic update)
function updateMessageReaction(messageId, reactionType, add) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    
    const messageEl = container.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageEl) return;
    
    const messageBubble = messageEl.querySelector('.message-bubble');
    if (!messageBubble) return;
    
    let reactionsEl = messageBubble.querySelector('.message-reactions');
    if (!reactionsEl) {
        // Create reactions container if it doesn't exist
        reactionsEl = document.createElement('div');
        reactionsEl.className = 'message-reactions';
        const messageTime = messageBubble.querySelector('.message-time');
        if (messageTime) {
            messageTime.parentNode.insertBefore(reactionsEl, messageTime);
        } else {
            messageBubble.appendChild(reactionsEl);
        }
    }
    
    // Get current reactions
    const currentReactions = reactionsEl.querySelectorAll('.reaction-badge');
    let found = false;
    let currentCount = 0;
    
    currentReactions.forEach(badge => {
        const emoji = getReactionEmoji(reactionType);
        if (badge.textContent.includes(emoji)) {
            found = true;
            // Extract count
            const match = badge.textContent.match(/(\d+)/);
            if (match) {
                currentCount = parseInt(match[1]);
            }
        }
    });
    
    // Optimistic update - will be replaced by server response
    // We'll just show a loading state or wait for server response
    // The real update will come via WebSocket handleReactionUpdate
}

// Connect WebSocket
function connectWebSocket() {
    if (!currentUser || wsConnection || isLoggedOut || !accessToken) return;
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/messages/ws/${currentUser.id}?token=${accessToken}`;
    
    wsConnection = new WebSocket(wsUrl);
    
    wsConnection.onopen = () => {
        console.log('WebSocket connected');
    };
    
    wsConnection.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };
    
    wsConnection.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    wsConnection.onclose = () => {
        console.log('WebSocket disconnected');
        wsConnection = null;
        // Only reconnect if not logged out
        if (!isLoggedOut && accessToken) {
            setTimeout(connectWebSocket, 5000); // Reconnect after 5s
        }
    };
}

// Handle WebSocket messages
function handleWebSocketMessage(data) {
    if (data.type === 'message') {
        if (!currentUser || !currentUser.id) {
            console.warn('Received message but currentUser is not set');
            return;
        }
        
        const senderId = data.sender_id || data.from;
        if (!senderId) {
            console.warn('Received message without sender_id or from');
            return;
        }
        
        const isOwn = senderId === currentUser.id;
        const receiverId = data.receiver_id || (isOwn ? currentChatUserId : currentUser.id);
        
        // Determine if this message is for the current chat
        const isCurrentChat = currentChatUserId && (
            // Our own message to current chat user
            (isOwn && receiverId === currentChatUserId) ||
            // Message from current chat user to us
            (!isOwn && senderId === currentChatUserId && receiverId === currentUser.id)
        );
        
        if (isCurrentChat) {
            // This message is for the current chat - add it
        addMessageToChat(data);
        } else {
            // This message is for a different chat - just update conversations list
            clearTimeout(window.conversationUpdateTimeout);
            window.conversationUpdateTimeout = setTimeout(() => {
                loadConversations();
            }, 300);
        }
    } else if (data.type === 'reaction_update') {
        // Handle reaction update - only if it's for current chat
        if (shouldShowReactionUpdate(data)) {
            handleReactionUpdate(data);
        }
    } else if (data.type === 'message_edited') {
        // Handle message edit - only if it's for current chat
        if (shouldShowMessageEdit(data)) {
            handleMessageEdited(data);
        }
    } else if (data.type === 'message_deleted') {
        // Handle message delete - only if it's for current chat
        if (shouldShowMessageDelete(data)) {
            handleMessageDeleted(data);
        }
    } else if (data.type === 'call_request') {
        // Handle incoming call request (new protocol)
        handleCallRequest(data);
    } else if (data.type === 'call_accept') {
        // Handle call accept - caller can now start the call
        handleCallAccept(data);
    } else if (data.type === 'call_reject') {
        // Handle call reject
        handleCallReject(data);
    } else if (data.type === 'incoming_call') {
        showIncomingCall(data);
    } else if (data.type === 'call_answer') {
        handleCallAnswer(data.sdp);
    } else if (data.type === 'ice_candidate') {
        handleIceCandidate(data.candidate);
    } else if (data.type === 'call_end') {
        // Only end call if we're actually in a call
        if (isCallActive || window.incomingCallData) {
        endCall();
        } else {
            // Just hide incoming call modal if it's showing
            const incomingCall = document.getElementById('incomingCall');
            if (incomingCall) {
                incomingCall.classList.add('hidden');
            }
            if (window.incomingCallAudio) {
                window.incomingCallAudio.pause();
                window.incomingCallAudio = null;
            }
            window.incomingCallData = null;
            window.incomingCallType = null;
        }
    }
}

// Check if reaction update should be shown for current chat
function shouldShowReactionUpdate(data) {
    if (!currentChatUserId || !currentUser || !currentUser.id) return false;
    
    const senderId = data.sender_id;
    const receiverId = data.receiver_id;
    
    // Check if this message belongs to current chat
    const isCurrentChat = (
        (senderId === currentUser.id && receiverId === currentChatUserId) ||
        (senderId === currentChatUserId && receiverId === currentUser.id)
    );
    
    return isCurrentChat;
}

// Check if message edit should be shown for current chat
function shouldShowMessageEdit(data) {
    if (!currentChatUserId || !currentUser || !currentUser.id) return false;
    
    const senderId = data.sender_id;
    const receiverId = data.receiver_id;
    
    // Check if this message belongs to current chat
    const isCurrentChat = (
        (senderId === currentUser.id && receiverId === currentChatUserId) ||
        (senderId === currentChatUserId && receiverId === currentUser.id)
    );
    
    return isCurrentChat;
}

// Check if message delete should be shown for current chat
function shouldShowMessageDelete(data) {
    if (!currentChatUserId || !currentUser || !currentUser.id) return false;
    
    const senderId = data.sender_id;
    const receiverId = data.receiver_id;
    
    // Check if this message belongs to current chat
    const isCurrentChat = (
        (senderId === currentUser.id && receiverId === currentChatUserId) ||
        (senderId === currentChatUserId && receiverId === currentUser.id)
    );
    
    return isCurrentChat;
}

// Handle reaction update from WebSocket
function handleReactionUpdate(data) {
    const messageId = data.message_id;
    const reactions = data.reactions || [];
    
    if (!messageId) return;
    
    const container = document.getElementById('chatMessages');
    if (!container) return;
    
    const messageEl = container.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageEl) return;
    
    const messageBubble = messageEl.querySelector('.message-bubble');
    if (!messageBubble) return;
    
    // Find or create reactions container
    let reactionsEl = messageBubble.querySelector('.message-reactions');
    if (!reactionsEl) {
        reactionsEl = document.createElement('div');
        reactionsEl.className = 'message-reactions';
        const messageTime = messageBubble.querySelector('.message-time');
        if (messageTime) {
            messageTime.parentNode.insertBefore(reactionsEl, messageTime);
        } else {
            messageBubble.appendChild(reactionsEl);
        }
    }
    
    // Update reactions display
    if (reactions.length === 0) {
        reactionsEl.innerHTML = '';
        return;
    }
    
    // Group reactions by type
    const reactionsByType = {};
    reactions.forEach(r => {
        const emoji = getReactionEmoji(r.reaction_type);
        if (!reactionsByType[r.reaction_type]) {
            reactionsByType[r.reaction_type] = { count: 0, users: [] };
        }
        reactionsByType[r.reaction_type].count++;
        reactionsByType[r.reaction_type].users.push(r.user.username);
    });
    
    // Build reactions HTML
    let reactionsHtml = '';
    Object.entries(reactionsByType).forEach(([type, data]) => {
        reactionsHtml += `<span class="reaction-badge" title="${data.users.join(', ')}">${getReactionEmoji(type)} ${data.count}</span>`;
    });
    
    reactionsEl.innerHTML = reactionsHtml;
}

// Handle message edited from WebSocket
function handleMessageEdited(data) {
    const messageId = data.message_id;
    const newContent = data.content;
    const editedAt = data.edited_at;
    
    if (!messageId || !newContent) return;
    
    const container = document.getElementById('chatMessages');
    if (!container) return;
    
    const messageEl = container.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageEl) return;
    
    // Update message content
    const messageText = messageEl.querySelector('.message-text');
    if (messageText) {
        messageText.textContent = newContent;
    }
    
    // Update edited badge
    const messageBubble = messageEl.querySelector('.message-bubble');
    if (messageBubble) {
        const messageTime = messageBubble.querySelector('.message-time');
        if (messageTime) {
            let editedBadge = messageTime.querySelector('.edited-badge');
            if (!editedBadge) {
                editedBadge = document.createElement('span');
                editedBadge.className = 'edited-badge';
                messageTime.appendChild(editedBadge);
            }
            editedBadge.textContent = '(edited)';
        }
    }
}

// Handle message deleted from WebSocket
function handleMessageDeleted(data) {
    const messageId = data.message_id;
    
    if (!messageId) return;
    
    const container = document.getElementById('chatMessages');
    if (!container) return;
    
    const messageEl = container.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageEl) return;
    
    // Replace message content with deleted message
    const messageBubble = messageEl.querySelector('.message-bubble');
    if (messageBubble) {
        messageBubble.className = 'message-bubble deleted-message';
        messageBubble.innerHTML = '<i class="fas fa-trash"></i> This message was deleted';
        
        // Remove menu button if exists
        const menuBtn = messageBubble.querySelector('.message-menu-btn');
        if (menuBtn) {
            menuBtn.remove();
        }
        
        // Remove reactions if exists
        const reactionsEl = messageBubble.querySelector('.message-reactions');
        if (reactionsEl) {
            reactionsEl.remove();
        }
        
        // Update time
        const messageTime = messageBubble.querySelector('.message-time');
        if (messageTime) {
            messageTime.innerHTML = formatTime(new Date().toISOString());
        }
    }
    
    // Update conversations list
    clearTimeout(window.conversationUpdateTimeout);
    window.conversationUpdateTimeout = setTimeout(() => {
        loadConversations();
    }, 300);
}

function addMessageToChat(msg) {
    // Check if we're in the chat view and viewing the correct conversation
    const senderId = msg.sender_id || msg.from;
    const receiverId = msg.receiver_id || (senderId === currentUser.id ? currentChatUserId : currentUser.id);
    const isOwn = senderId === currentUser.id;
    
    // Determine if this message belongs to current chat
    const isCurrentChat = currentChatUserId && (
        // Our own message to current chat user
        (isOwn && receiverId === currentChatUserId) ||
        // Message from current chat user to us
        (!isOwn && senderId === currentChatUserId && receiverId === currentUser.id)
    );
    
    if (!isCurrentChat) {
        // Not for current chat, just update conversations list (debounced)
        clearTimeout(window.conversationUpdateTimeout);
        window.conversationUpdateTimeout = setTimeout(() => {
        loadConversations();
        }, 300);
        return;
    }
    
    // Get chat messages container
    const container = document.getElementById('chatMessages');
    if (!container) return;
    
    // Check if message already exists in the chat (avoid duplicates)
    if (msg.id) {
        const existingMsg = container.querySelector(`[data-message-id="${msg.id}"]`);
        if (existingMsg) {
            // Message already displayed, just scroll to bottom
            container.scrollTop = container.scrollHeight;
            return;
        }
    }
    
    // If this is a real message and we have an optimistic version, replace it
    if (!msg.isOptimistic && msg.id && senderId === currentUser.id) {
        // First check if we have temp_id match
        if (msg.temp_id) {
            const tempId = msg.temp_id;
            if (pendingMessages.has(tempId)) {
                replaceOptimisticMessage(tempId, msg);
                return;
            }
        }
        
        // Fallback: Check if we have a pending optimistic message by content and timing
        for (const [tempId, pending] of pendingMessages.entries()) {
            const pendingMsg = pending.message;
            // Match by content and timing (within 5 seconds)
            if (pendingMsg.content === msg.content && 
                pendingMsg.attachment === msg.attachment &&
                pendingMsg.message_type === msg.message_type &&
                Date.now() - pending.timestamp < 5000) {
                replaceOptimisticMessage(tempId, msg);
                return;
            }
        }
    }
    
    // Add message immediately to chat
    if (senderId) {
        const msgEl = document.createElement('div');
        msgEl.className = `message-item ${isOwn ? 'own' : ''}`;
        msgEl.dataset.messageId = msg.id;
        
        let messageContent = '';
        if (msg.message_type === 'image' && msg.attachment) {
            messageContent = `<img src="/uploads/${msg.attachment}" alt="Image" class="message-image" onclick="openImageModal('/uploads/${msg.attachment}')">`;
        } else if (msg.message_type === 'video' && msg.attachment) {
            messageContent = `<video src="/uploads/${msg.attachment}" controls class="message-video"></video>`;
        } else if (msg.message_type === 'circular_video' && msg.attachment) {
            messageContent = `<video src="/uploads/${msg.attachment}" controls class="message-video circular-video"></video>`;
        } else if (msg.message_type === 'location' && msg.location_lat && msg.location_lng) {
            messageContent = `
                <div class="message-location">
                    <i class="fas fa-map-marker-alt"></i>
                    <a href="https://www.google.com/maps?q=${msg.location_lat},${msg.location_lng}" target="_blank">
                        View Location
                    </a>
                    <div class="location-map">
                        <iframe 
                            src="https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dP9Jb3w&q=${msg.location_lat},${msg.location_lng}"
                            width="100%" height="200" frameborder="0" style="border:0;" allowfullscreen>
                        </iframe>
                    </div>
                </div>
            `;
        }
        
        if (msg.content) {
            messageContent += `<div class="message-text">${escapeHtml(msg.content)}</div>`;
        }
        
        const sender = msg.sender || currentUser;
        const senderAvatar = sender.profile_pic ? `/uploads/${sender.profile_pic}` : '/static/default-avatar.png';
        const currentUserAvatar = currentUser.profile_pic ? `/uploads/${currentUser.profile_pic}` : '/static/default-avatar.png';
        
        msgEl.innerHTML = `
            <img src="${isOwn ? currentUserAvatar : senderAvatar}" 
                 alt="Avatar" class="avatar-small">
            <div class="message-bubble">
                ${messageContent}
                <div class="message-time">
                    ${formatTime(msg.timestamp || msg.created_at || new Date().toISOString())}
                </div>
                ${isOwn ? '<button class="message-menu-btn" onclick="showMessageMenu(event, ' + msg.id + ')"><i class="fas fa-ellipsis-v"></i></button>' : ''}
            </div>
        `;
        
        if (isOwn) {
            msgEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showMessageMenu(e, msg.id);
            });
        }
        
        container.appendChild(msgEl);
        container.scrollTop = container.scrollHeight;
    }
    
    // Update conversations list (debounced to avoid too many updates)
    if (!msg.isOptimistic) {
        clearTimeout(window.conversationUpdateTimeout);
        window.conversationUpdateTimeout = setTimeout(() => {
            loadConversations();
        }, 500);
    }
}

// Helper function to get getUserMedia with fallback and proper permission handling
async function getUserMedia(constraints) {
    // Check if mediaDevices is available
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            // Try to get media - browser will handle secure context and permissions
            return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
            // Provide better error messages
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                throw new Error('PERMISSION_DENIED: Camera/Microphone permission was denied. Please allow access in your browser settings.');
            } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                throw new Error('DEVICE_NOT_FOUND: No camera/microphone found. Please connect a device.');
            } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                throw new Error('DEVICE_BUSY: Camera/Microphone is being used by another application.');
            } else if (error.name === 'OverconstrainedError' || error.name === 'ConstraintNotSatisfiedError') {
                throw new Error('CONSTRAINT_ERROR: Requested constraints cannot be satisfied.');
            } else if (error.name === 'NotSupportedError' || error.message?.includes('secure context') || error.message?.includes('HTTPS')) {
                // Secure context error - provide helpful message
                throw new Error('SECURE_CONTEXT_REQUIRED: Media access requires HTTPS or localhost. Please use HTTPS or access from localhost.');
            } else {
                // Re-throw original error with its message
                throw error;
            }
        }
    }
    
    // Fallback for older browsers (deprecated but still used in some)
    const legacyGetUserMedia = navigator.getUserMedia || 
                              navigator.webkitGetUserMedia || 
                              navigator.mozGetUserMedia || 
                              navigator.msGetUserMedia;
    
    if (!legacyGetUserMedia) {
        throw new Error('BROWSER_NOT_SUPPORTED: getUserMedia is not supported in this browser. Please use a modern browser.');
    }
    
    return new Promise((resolve, reject) => {
        legacyGetUserMedia.call(navigator, constraints, resolve, reject);
    });
}

// Check and request media permissions
async function checkMediaPermissions() {
    // Check for modern API first
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        // Modern API is available, check permissions if possible
        if (navigator.permissions && navigator.permissions.query) {
            try {
                const cameraPermission = await navigator.permissions.query({ name: 'camera' });
                const microphonePermission = await navigator.permissions.query({ name: 'microphone' });
                
                return {
                    supported: true,
                    camera: cameraPermission.state, // 'granted', 'denied', 'prompt'
                    microphone: microphonePermission.state
                };
            } catch (e) {
                // Permissions API not fully supported, continue anyway
                return { supported: true, message: 'Permission status unknown' };
            }
        }
        
        return { supported: true, message: 'Permission API not available' };
    }
    
    // Check for legacy API
    const legacyGetUserMedia = navigator.getUserMedia || 
                              navigator.webkitGetUserMedia || 
                              navigator.mozGetUserMedia || 
                              navigator.msGetUserMedia;
    
    if (legacyGetUserMedia) {
        return { supported: true, message: 'Using legacy API' };
    }
    
    // If neither modern nor legacy API is available, return false
    // But note: even if secure context check fails, we should still try getUserMedia
    // and let the browser handle the error
    return {
        supported: false,
        message: 'Media access is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Edge.'
    };
}

// WebRTC Call functions
// New protocol: call_request -> call_accept -> offer/answer
async function startCall(type) {
    if (!currentChatUserId || isCallActive) {
        console.warn('Cannot start call: no user selected or call already active');
        return;
    }
    
    // Check if WebRTC is supported
    if (!window.RTCPeerConnection) {
        showError('profileMessage', 'WebRTC is not supported in this browser');
        return;
    }
    
    // Check WebSocket connection
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
        showError('profileMessage', 'WebSocket connection not available. Please refresh the page.');
        return;
    }
    
    // Show call UI first (before setting isCallActive)
    const chatView = document.getElementById('chatView');
    const callContainer = document.getElementById('callContainer');
    
    if (chatView) {
        chatView.classList.add('hidden');
    }
    if (callContainer) {
        callContainer.classList.remove('hidden');
        // Update call type indicator
        const callTypeIndicator = document.getElementById('callTypeIndicator');
        if (callTypeIndicator) {
            callTypeIndicator.textContent = type === 'video' ? 'Video Call' : 'Audio Call';
            callTypeIndicator.className = type === 'video' ? 'call-type video' : 'call-type audio';
        }
        
        // Show placeholder with user name
        const remoteVideoPlaceholder = document.getElementById('remoteVideoPlaceholder');
        const remoteVideoName = document.getElementById('remoteVideoName');
        if (remoteVideoPlaceholder) {
            remoteVideoPlaceholder.style.display = 'flex';
        }
        // Get user name from current chat
        if (remoteVideoName && currentChatUserId) {
            // Try to get user name from chat header
            const chatUserName = document.getElementById('chatUserName');
            if (chatUserName) {
                remoteVideoName.textContent = chatUserName.textContent || 'Connecting...';
            } else {
                remoteVideoName.textContent = 'Connecting...';
            }
        }
    }
    
    // Show calling status
    updateCallStatus('Calling...');
    
    // Store call state for when call is accepted
    window.pendingCallType = type;
    window.pendingCallUserId = currentChatUserId;
    
    // Send call request (new protocol)
    try {
        wsConnection.send(JSON.stringify({
            type: 'call_request',
            to: currentChatUserId,
            call_type: type
        }));
        
        // Wait for call_accept or call_reject
        // This will be handled in handleWebSocketMessage
    } catch (e) {
        console.error('Error sending call request:', e);
        showError('profileMessage', 'Failed to send call request');
        endCall();
    }
}

// Handle call request acceptance and start actual call
async function startCallAfterAccept(type) {
    if (!window.pendingCallUserId) {
        console.warn('No pending call to start');
        return;
    }
    
    const targetUserId = window.pendingCallUserId;
    window.pendingCallType = null;
    window.pendingCallUserId = null;
    
    try {
        // Try to get media directly - let browser handle permissions and secure context
        updateCallStatus('Requesting camera/microphone access...');
        
        // Try to get media - browser will prompt for permissions if needed
        localStream = await getUserMedia({
            audio: true,
            video: type === 'video'
        });
        
        // Check if we actually got the streams
        if (!localStream) {
            throw new Error('Failed to get media stream');
        }
        
        const audioTracks = localStream.getAudioTracks();
        const videoTracks = localStream.getVideoTracks();
        
        if (audioTracks.length === 0) {
            throw new Error('No audio track available');
        }
        
        if (type === 'video' && videoTracks.length === 0) {
            throw new Error('No video track available');
        }
        
        // Set isCallActive only after media is successfully obtained
        isCallActive = true;
        
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            // Show local video only if it's a video call
            if (type === 'video') {
                localVideo.style.display = 'block';
            } else {
                localVideo.style.display = 'none';
            }
        }
        
        // Store current call type and device ID
        currentCallType = type;
        if (type === 'video' && videoTracks.length > 0) {
            currentVideoDeviceId = videoTracks[0].getSettings().deviceId;
        }
        
        // Show/hide video-related buttons
        const switchCameraBtn = document.getElementById('switchCameraBtn');
        const screenShareBtn = document.getElementById('screenShareBtn');
        const videoBtn = document.getElementById('videoBtn');
        if (switchCameraBtn) {
            switchCameraBtn.style.display = type === 'video' ? 'flex' : 'none';
        }
        if (screenShareBtn) {
            screenShareBtn.style.display = type === 'video' ? 'flex' : 'none';
        }
        if (videoBtn) {
            videoBtn.style.display = type === 'video' ? 'flex' : 'none';
        }
        
        // Update call status
        updateCallStatus('Connecting...');
        
        peerConnection = new RTCPeerConnection(rtcConfig);
        
        // Add tracks instead of deprecated addStream
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Handle remote stream
        peerConnection.ontrack = (event) => {
            console.log('Received remote track:', event.track.kind);
            if (event.streams && event.streams.length > 0) {
                remoteStream = event.streams[0];
                const remoteVideo = document.getElementById('remoteVideo');
                const remoteVideoPlaceholder = document.getElementById('remoteVideoPlaceholder');
                
                if (remoteVideo) {
                    remoteVideo.srcObject = remoteStream;
                    // Hide placeholder when video/audio starts
                    if (remoteVideoPlaceholder) {
                        remoteVideoPlaceholder.style.display = 'none';
                    }
                    updateCallStatus('Connected');
                    startCallTimer();
                }
            }
        };
        
        // Handle connection state changes
        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;
            console.log('Connection state:', state);
            
            if (state === 'connected') {
                updateCallStatus('Connected');
                startCallTimer();
            } else if (state === 'connecting') {
                updateCallStatus('Connecting...');
            } else if (state === 'disconnected') {
                updateCallStatus('Disconnected');
                stopCallTimer();
                // Give it a moment to reconnect
                setTimeout(() => {
                    if (peerConnection && peerConnection.connectionState === 'disconnected') {
                        endCall();
                    }
                }, 3000);
            } else if (state === 'failed') {
                updateCallStatus('Connection failed');
                stopCallTimer();
                setTimeout(() => endCall(), 2000);
            } else if (state === 'closed') {
                console.log('Peer connection closed');
                stopCallTimer();
            }
        };
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && wsConnection && wsConnection.readyState === WebSocket.OPEN && targetUserId) {
                try {
                    wsConnection.send(JSON.stringify({
                        type: 'ice_candidate',
                        to: targetUserId,
                        candidate: event.candidate
                    }));
                } catch (e) {
                    console.error('Error sending ICE candidate:', e);
                }
            } else if (!event.candidate) {
                console.log('ICE candidate gathering complete');
            }
        };
        
        const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: type === 'video'
        });
        await peerConnection.setLocalDescription(offer);
        
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            try {
                // Send offer as SDP
                wsConnection.send(JSON.stringify({
                    type: 'incoming_call',
                    to: targetUserId,
                    sdp: offer,  // RTCSessionDescription object will be serialized
                    call_type: type
                }));
                updateCallStatus('Calling...');
            } catch (e) {
                console.error('Error sending call offer:', e);
                throw new Error('Failed to send call invitation');
            }
        } else {
            throw new Error('WebSocket connection not available');
        }
    } catch (error) {
        console.error('Error starting call:', error);
        let errorMessage = 'Failed to start call';
        let errorTitle = 'Call Error';
        
        // Parse error message for better user feedback
        if (error.message) {
            if (error.message.includes('PERMISSION_DENIED')) {
                errorTitle = 'Permission Denied';
                errorMessage = 'Camera/Microphone permission was denied.\n\n' +
                             'Please:\n' +
                             '1. Click the lock/camera icon in your browser address bar\n' +
                             '2. Allow camera and microphone access\n' +
                             '3. Refresh the page and try again';
            } else if (error.message.includes('DEVICE_NOT_FOUND')) {
                errorTitle = 'Device Not Found';
                errorMessage = 'No camera or microphone found.\n\n' +
                             'Please connect a camera/microphone and try again.';
            } else if (error.message.includes('DEVICE_BUSY')) {
                errorTitle = 'Device Busy';
                errorMessage = 'Camera/Microphone is being used by another application.\n\n' +
                             'Please close other applications using the camera/microphone.';
            } else if (error.message.includes('BROWSER_NOT_SUPPORTED')) {
                errorTitle = 'Browser Not Supported';
                errorMessage = 'Your browser does not support video/audio calls.\n\n' +
                             'Please use a modern browser like Chrome, Firefox, or Edge.';
            } else if (error.message.includes('HTTPS') || error.message.includes('localhost')) {
                errorTitle = 'Security Required';
                errorMessage = 'Media access requires HTTPS or localhost.\n\n' +
                             'Current protocol: ' + location.protocol + '\n' +
                             'Please use HTTPS or run on localhost.';
            } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                errorTitle = 'Permission Denied';
                errorMessage = 'Camera/Microphone permission was denied.\n\n' +
                             'Please allow access in your browser settings.';
            } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                errorTitle = 'Device Not Found';
                errorMessage = 'Camera/Microphone not found.';
            } else {
                errorMessage = error.message || 'Unknown error occurred';
            }
        } else if (error.name) {
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                errorTitle = 'Permission Denied';
                errorMessage = 'Camera/Microphone permission was denied.';
            } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                errorTitle = 'Device Not Found';
                errorMessage = 'Camera/Microphone not found.';
            }
        }
        
        // Reset state before showing error
        isCallActive = false;
        
        // Show user-friendly error
        alert(`${errorTitle}\n\n${errorMessage}`);
        
        // Try to show error in UI, but don't fail if element doesn't exist
        try {
            showError('profileMessage', errorMessage);
        } catch (e) {
            console.error('Could not show error in UI:', e);
        }
        
        // Clean up and end call
        endCall();
    }
}

// Update call status text
function updateCallStatus(status) {
    const statusElement = document.getElementById('callStatus');
    if (statusElement) {
        statusElement.textContent = status;
    }
}

// Call timer
let callTimerInterval = null;
let callStartTime = null;

function startCallTimer() {
    if (callTimerInterval) return; // Already running
    
    callStartTime = Date.now();
    const callTimer = document.getElementById('callTimer');
    const callTimerText = document.getElementById('callTimerText');
    
    if (callTimer && callTimerText) {
        callTimer.style.display = 'flex';
        
        callTimerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            callTimerText.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }, 1000);
    }
}

function stopCallTimer() {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
    callStartTime = null;
    
    const callTimer = document.getElementById('callTimer');
    if (callTimer) {
        callTimer.style.display = 'none';
    }
}

// Handle call request (new protocol - before offer)
function handleCallRequest(data) {
    console.log('Call request received:', data);
    
    // Don't show if we're already in a call
    if (isCallActive) {
        console.log('Call already active, rejecting call request');
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN && data.from) {
            try {
                wsConnection.send(JSON.stringify({
                    type: 'call_reject',
                    to: data.from
                }));
            } catch (e) {
                console.error('Error sending call_reject:', e);
            }
        }
        return;
    }
    
    // Show incoming call UI (same as showIncomingCall but for call_request)
    showIncomingCall({
        ...data,
        type: 'call_request'  // Mark as call_request
    });
}

// Handle call accept (caller receives this)
function handleCallAccept(data) {
    console.log('Call accepted by receiver:', data);
    
    // Start the actual call now that it's accepted
    if (window.pendingCallType) {
        const callType = window.pendingCallType;
        startCallAfterAccept(callType);
    } else {
        console.warn('No pending call type found');
        endCall();
    }
}

// Handle call reject (caller receives this)
function handleCallReject(data) {
    console.log('Call rejected by receiver:', data);
    
    // Clear pending call state
    window.pendingCallType = null;
    window.pendingCallUserId = null;
    
    // Show rejection message
    updateCallStatus('Call rejected');
    
    // End call after a moment
    setTimeout(() => {
        endCall();
    }, 2000);
}

function showIncomingCall(data) {
    console.log('Incoming call received:', data);
    
    // Don't show if we're already in a call
    if (isCallActive) {
        console.log('Call already active, rejecting incoming call');
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN && data.from) {
            try {
                wsConnection.send(JSON.stringify({
                    type: 'call_end',
                    to: data.from
                }));
            } catch (e) {
                console.error('Error sending call_end to reject incoming call:', e);
            }
        }
        // Clear incoming call data
        window.incomingCallData = null;
        window.incomingCallType = null;
        return;
    }
    
    const incomingCall = document.getElementById('incomingCall');
    const incomingCaller = document.getElementById('incomingCaller');
    const incomingCallAvatar = document.getElementById('incomingCallAvatar');
    const incomingCallType = document.getElementById('incomingCallType');
    const remoteVideoName = document.getElementById('remoteVideoName');
    const callContainer = document.getElementById('callContainer');
    const chatView = document.getElementById('chatView');
    
    // Hide chat view and show call container
    if (chatView) {
        chatView.classList.add('hidden');
    }
    if (callContainer) {
        callContainer.classList.remove('hidden');
    }
    
    // Show incoming call modal
    if (incomingCall) {
        incomingCall.classList.remove('hidden');
    }
    
    // Get caller name
    const callerName = data.caller ? (
        data.caller.first_name && data.caller.last_name 
            ? `${data.caller.first_name} ${data.caller.last_name}`.trim()
            : data.caller.username || data.caller.first_name || 'Unknown'
    ) : 'Unknown';
    
    if (incomingCaller) {
        incomingCaller.textContent = callerName;
    }
    
    if (remoteVideoName) {
        remoteVideoName.textContent = callerName;
    }
    
    // Set avatar
    if (incomingCallAvatar && data.caller) {
        const avatarUrl = data.caller.profile_pic 
            ? `/uploads/${data.caller.profile_pic}` 
            : '/static/default-avatar.png';
        incomingCallAvatar.src = avatarUrl;
        incomingCallAvatar.onerror = function() {
            this.src = '/static/default-avatar.png';
        };
    }
    
    // Set call type
    const callType = data.call_type || 'video';
    if (incomingCallType) {
        incomingCallType.textContent = callType === 'video' ? 'Video Call' : 'Audio Call';
        incomingCallType.className = `incoming-call-type ${callType}`;
    }
    
    // Store call data for later use
    window.incomingCallData = data;
    window.incomingCallType = callType;
    
    // Update call type indicator in call container
    const callTypeIndicator = document.getElementById('callTypeIndicator');
    if (callTypeIndicator) {
        callTypeIndicator.textContent = callType === 'video' ? 'Video Call' : 'Audio Call';
        callTypeIndicator.className = `call-type ${callType}`;
    }
    
    // Play notification sound - create ringtone programmatically
    playIncomingCallRingtone();
}

// Play incoming call ringtone
function playIncomingCallRingtone() {
    try {
        // Stop any existing ringtone
        if (window.incomingCallAudio) {
            window.incomingCallAudio.pause();
            window.incomingCallAudio = null;
        }
        
        // Try to use Web Audio API for better control
        if (window.AudioContext || window.webkitAudioContext) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const audioContext = new AudioContext();
            
            // Resume audio context if suspended (required for autoplay policy)
            // Also try to resume on user interaction
            const resumeAudio = () => {
                if (audioContext.state === 'suspended') {
                    audioContext.resume().then(() => {
                        console.log('Audio context resumed');
                    }).catch(e => {
                        console.log('Could not resume audio context:', e);
                    });
                }
            };
            
            resumeAudio();
            
            // Try to resume on any user interaction
            const resumeOnInteraction = () => {
                resumeAudio();
                ['click', 'touchstart', 'keydown'].forEach(eventType => {
                    document.removeEventListener(eventType, resumeOnInteraction);
                });
            };
            
            ['click', 'touchstart', 'keydown'].forEach(eventType => {
                document.addEventListener(eventType, resumeOnInteraction, { once: true });
            });
            
            // Function to play ringtone pattern
            const playRingPattern = () => {
                if (!window.incomingCallData) return;
                
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                // Set ringtone frequency (phone ring sound - alternating tones)
                oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
                oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
                oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.3);
                
                // Set volume
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
                
                // Start and stop pattern (ring pattern)
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.4);
            };
            
            // Play first ring immediately
            playRingPattern();
            
            // Store context for cleanup
            window.incomingCallAudioContext = audioContext;
            
            // Repeat ringtone every 2 seconds
            window.incomingCallRingtoneInterval = setInterval(() => {
                if (!window.incomingCallData) {
                    clearInterval(window.incomingCallRingtoneInterval);
                    return;
                }
                playRingPattern();
            }, 2000);
            
            window.incomingCallAudio = { context: audioContext, type: 'webaudio' };
        } else {
            // Fallback: Try to load audio file or use simple beep
            try {
                const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGW57+OeTQ8MT6fj8LZjHAY4kdfyzHksBSR3x/DdkEAKFF606euoVRQKRp/g8r5sIQUrgc7y2Yk2CBhlue/jnk0PDE+n4/C2YxwGOJHX8sx5LAUkd8fw3ZBAC');
                audio.loop = true;
                audio.volume = 0.5;
                window.incomingCallAudio = audio;
                
                // Try to play with user interaction
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.catch(e => {
                        console.log('Could not play audio file, using beep:', e);
                        // Fallback to simple beep
                        playSimpleBeep();
                    });
                }
            } catch (e) {
                console.log('Audio file not available, using beep:', e);
                playSimpleBeep();
            }
        }
    } catch (e) {
        console.error('Error playing ringtone:', e);
        // Fallback to simple beep
        playSimpleBeep();
    }
}

// Simple beep fallback
function playSimpleBeep() {
    if (window.incomingCallBeepInterval) {
        clearInterval(window.incomingCallBeepInterval);
    }
    
    // Create simple beep using AudioContext
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            const audioContext = new AudioContext();
            window.incomingCallAudioContext = audioContext;
            
            window.incomingCallBeepInterval = setInterval(() => {
                if (!window.incomingCallData) {
                    clearInterval(window.incomingCallBeepInterval);
                    if (audioContext) audioContext.close();
                    return;
                }
                
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.value = 800;
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.2);
            }, 2000);
            
            window.incomingCallAudio = { context: audioContext, type: 'beep' };
        }
    } catch (e) {
        console.error('Error creating beep:', e);
    }
}

// Stop incoming call ringtone
function stopIncomingCallRingtone() {
    if (window.incomingCallRingtoneInterval) {
        clearInterval(window.incomingCallRingtoneInterval);
        window.incomingCallRingtoneInterval = null;
    }
    
    if (window.incomingCallBeepInterval) {
        clearInterval(window.incomingCallBeepInterval);
        window.incomingCallBeepInterval = null;
    }
    
    if (window.incomingCallAudio) {
        if (window.incomingCallAudio.type === 'webaudio' || window.incomingCallAudio.type === 'beep') {
            if (window.incomingCallAudioContext) {
                window.incomingCallAudioContext.close();
                window.incomingCallAudioContext = null;
            }
        } else {
            window.incomingCallAudio.pause();
        }
        window.incomingCallAudio = null;
    }
}

async function acceptIncomingCall() {
    const incomingCall = document.getElementById('incomingCall');
    const chatView = document.getElementById('chatView');
    const callContainer = document.getElementById('callContainer');
    
    // Stop incoming call sound
    stopIncomingCallRingtone();
    
    if (incomingCall) {
        incomingCall.classList.add('hidden');
    }
    if (chatView) {
        chatView.classList.add('hidden');
    }
    if (callContainer) {
        callContainer.classList.remove('hidden');
    }
    
    // Check if this is a call_request (new protocol) or incoming_call (old protocol with offer)
    const isCallRequest = window.incomingCallData && window.incomingCallData.type === 'call_request';
    
    if (isCallRequest) {
        // New protocol: send call_accept first, then wait for offer
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN && window.incomingCallData.from) {
            try {
                wsConnection.send(JSON.stringify({
                    type: 'call_accept',
                    to: window.incomingCallData.from
                }));
                updateCallStatus('Call accepted, waiting for connection...');
                // Wait for incoming_call with offer
                return;
            } catch (e) {
                console.error('Error sending call_accept:', e);
                endCall();
                return;
            }
        }
    }
    
    // Old protocol or direct offer: proceed with accepting
    // Don't set isCallActive yet - wait until media is obtained
    const callType = window.incomingCallType || 'video';
    
    // Update call type indicator
    const callTypeIndicator = document.getElementById('callTypeIndicator');
    if (callTypeIndicator) {
        callTypeIndicator.textContent = callType === 'video' ? 'Video Call' : 'Audio Call';
        callTypeIndicator.className = `call-type ${callType}`;
    }
    
    updateCallStatus('Requesting permissions...');
    
    try {
        // Try to get media directly - let browser handle permissions
        updateCallStatus('Requesting camera/microphone access...');
        
        localStream = await getUserMedia({ 
            audio: true, 
            video: callType === 'video' 
        });
        
        // Check if we got the streams
        if (!localStream) {
            throw new Error('Failed to get media stream');
        }
        
        const audioTracks = localStream.getAudioTracks();
        const videoTracks = localStream.getVideoTracks();
        
        if (audioTracks.length === 0) {
            throw new Error('No audio track available');
        }
        
        if (callType === 'video' && videoTracks.length === 0) {
            throw new Error('No video track available');
        }
        
        // Set isCallActive only after media is successfully obtained
        isCallActive = true;
        
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = localStream;
            if (callType === 'video') {
                localVideo.style.display = 'block';
            } else {
                localVideo.style.display = 'none';
            }
        }
        
        // Store current call type and device ID
        currentCallType = callType;
        if (callType === 'video' && videoTracks.length > 0) {
            currentVideoDeviceId = videoTracks[0].getSettings().deviceId;
        }
        
        // Show/hide video-related buttons
        const switchCameraBtn = document.getElementById('switchCameraBtn');
        const screenShareBtn = document.getElementById('screenShareBtn');
        const videoBtn = document.getElementById('videoBtn');
        if (switchCameraBtn) {
            switchCameraBtn.style.display = callType === 'video' ? 'flex' : 'none';
        }
        if (screenShareBtn) {
            screenShareBtn.style.display = callType === 'video' ? 'flex' : 'none';
        }
        if (videoBtn) {
            videoBtn.style.display = callType === 'video' ? 'flex' : 'none';
        }
        
        peerConnection = new RTCPeerConnection(rtcConfig);
        
        // Add tracks
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Handle remote stream
        peerConnection.ontrack = (event) => {
            console.log('Received remote track:', event.track.kind);
            if (event.streams && event.streams.length > 0) {
            remoteStream = event.streams[0];
            const remoteVideo = document.getElementById('remoteVideo');
                const remoteVideoPlaceholder = document.getElementById('remoteVideoPlaceholder');
                
            if (remoteVideo) {
                remoteVideo.srcObject = remoteStream;
                    // Hide placeholder when video/audio starts
                    if (remoteVideoPlaceholder) {
                        remoteVideoPlaceholder.style.display = 'none';
                    }
                    updateCallStatus('Connected');
                    startCallTimer();
                }
            }
        };
        
        // Handle connection state
        peerConnection.onconnectionstatechange = () => {
            const state = peerConnection.connectionState;
            console.log('Connection state:', state);
            
            if (state === 'connected') {
                updateCallStatus('Connected');
                startCallTimer();
            } else if (state === 'connecting') {
                updateCallStatus('Connecting...');
            } else if (state === 'disconnected') {
                updateCallStatus('Disconnected');
                stopCallTimer();
                // Give it a moment to reconnect
                setTimeout(() => {
                    if (peerConnection && peerConnection.connectionState === 'disconnected') {
                        endCall();
                    }
                }, 3000);
            } else if (state === 'failed') {
                updateCallStatus('Connection failed');
                stopCallTimer();
                setTimeout(() => endCall(), 2000);
            } else if (state === 'closed') {
                console.log('Peer connection closed');
                stopCallTimer();
            }
        };
        
        peerConnection.onicecandidate = (event) => {
            if (event.candidate && wsConnection && wsConnection.readyState === WebSocket.OPEN && window.incomingCallData) {
                try {
                    wsConnection.send(JSON.stringify({
                    type: 'ice_candidate',
                    to: window.incomingCallData.from,
                    candidate: event.candidate
                }));
                } catch (e) {
                    console.error('Error sending ICE candidate:', e);
                }
            } else if (!event.candidate) {
                console.log('ICE candidate gathering complete');
            }
        };
        
        if (!window.incomingCallData || !window.incomingCallData.sdp) {
            throw new Error('Invalid call data received');
        }
        
        // Handle SDP - it might be an object or string
        let remoteSdp = window.incomingCallData.sdp;
        if (typeof remoteSdp === 'string') {
            try {
                remoteSdp = JSON.parse(remoteSdp);
            } catch (e) {
                console.error('Error parsing SDP string:', e);
                // If parsing fails, try using it as is
            }
        }
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(remoteSdp));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        if (wsConnection && wsConnection.readyState === WebSocket.OPEN && window.incomingCallData.from) {
            try {
                wsConnection.send(JSON.stringify({
            type: 'call_answer',
            to: window.incomingCallData.from,
            sdp: answer
        }));
            } catch (e) {
                console.error('Error sending call answer:', e);
                throw new Error('Failed to send call answer');
            }
        } else {
            throw new Error('WebSocket connection not available');
        }
    } catch (error) {
        console.error('Error accepting call:', error);
        let errorMessage = 'Failed to accept call';
        let errorTitle = 'Call Error';
        
        // Parse error message for better user feedback
        if (error.message) {
            if (error.message.includes('PERMISSION_DENIED')) {
                errorTitle = 'Permission Denied';
                errorMessage = 'Camera/Microphone permission was denied.\n\n' +
                             'Please:\n' +
                             '1. Click the lock/camera icon in your browser address bar\n' +
                             '2. Allow camera and microphone access\n' +
                             '3. Refresh the page and try again';
            } else if (error.message.includes('DEVICE_NOT_FOUND')) {
                errorTitle = 'Device Not Found';
                errorMessage = 'No camera or microphone found.\n\n' +
                             'Please connect a camera/microphone and try again.';
            } else if (error.message.includes('DEVICE_BUSY')) {
                errorTitle = 'Device Busy';
                errorMessage = 'Camera/Microphone is being used by another application.';
            } else if (error.message.includes('BROWSER_NOT_SUPPORTED')) {
                errorTitle = 'Browser Not Supported';
                errorMessage = 'Your browser does not support video/audio calls.';
            } else if (error.message.includes('HTTPS') || error.message.includes('localhost')) {
                errorTitle = 'Security Required';
                errorMessage = 'Media access requires HTTPS or localhost.';
            } else {
                errorMessage = error.message || 'Unknown error occurred';
            }
        } else if (error.name) {
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                errorTitle = 'Permission Denied';
                errorMessage = 'Camera/Microphone permission was denied.';
            } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                errorTitle = 'Device Not Found';
                errorMessage = 'Camera/Microphone not found.';
            }
        }
        
        // Reset state before showing error
        isCallActive = false;
        
        // Show user-friendly error
        alert(`${errorTitle}\n\n${errorMessage}`);
        
        // Try to show error in UI, but don't fail if element doesn't exist
        try {
            showError('profileMessage', errorMessage);
        } catch (e) {
            console.error('Could not show error in UI:', e);
        }
        
        // Clean up and end call
        endCall();
    }
}

function rejectIncomingCall() {
    const incomingCall = document.getElementById('incomingCall');
    const callContainer = document.getElementById('callContainer');
    const chatView = document.getElementById('chatView');
    
    if (incomingCall) {
        incomingCall.classList.add('hidden');
    }
    
    // Stop incoming call sound
    stopIncomingCallRingtone();
    
    // Check if this is a call_request (new protocol) or incoming_call (old protocol)
    const isCallRequest = window.incomingCallData && window.incomingCallData.type === 'call_request';
    
    // Send appropriate rejection signal
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN && window.incomingCallData && window.incomingCallData.from) {
        try {
            if (isCallRequest) {
                // New protocol: send call_reject
                wsConnection.send(JSON.stringify({
                    type: 'call_reject',
                    to: window.incomingCallData.from
                }));
            } else {
                // Old protocol: send call_end
                wsConnection.send(JSON.stringify({
                    type: 'call_end',
                    to: window.incomingCallData.from
                }));
            }
        } catch (e) {
            console.error('Error sending rejection signal:', e);
        }
    }
    
    // Hide call container and show chat view
    if (callContainer) {
        callContainer.classList.add('hidden');
    }
    if (chatView) {
        chatView.classList.remove('hidden');
    }
    
    // Clear call data
    window.incomingCallData = null;
    window.incomingCallType = null;
    isCallActive = false;
}

function endCall() {
    isCallActive = false;
    
    // Stop incoming call sound
    stopIncomingCallRingtone();
    
    // Stop local stream
    if (localStream) {
        try {
            localStream.getTracks().forEach(track => {
                track.stop();
                track.enabled = false;
            });
        } catch (e) {
            console.error('Error stopping local stream tracks:', e);
        }
        localStream = null;
    }
    
    // Stop remote stream
    if (remoteStream) {
        try {
            remoteStream.getTracks().forEach(track => {
                track.stop();
                track.enabled = false;
            });
        } catch (e) {
            console.error('Error stopping remote stream tracks:', e);
        }
        remoteStream = null;
    }
    
    // Close peer connection
    if (peerConnection) {
        try {
            peerConnection.close();
        } catch (e) {
            console.error('Error closing peer connection:', e);
        }
        peerConnection = null;
    }
    
    // Send end call signal if we have connection
    // Use currentChatUserId or window.incomingCallData.from
    const callReceiverId = currentChatUserId || (window.incomingCallData && window.incomingCallData.from);
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN && callReceiverId) {
        try {
            wsConnection.send(JSON.stringify({
                type: 'call_end',
                to: callReceiverId
            }));
        } catch (e) {
            console.error('Error sending call_end signal:', e);
        }
    }
    
    // Update UI
    const callContainer = document.getElementById('callContainer');
    if (callContainer) {
        callContainer.classList.add('hidden');
    }
    
    const chatView = document.getElementById('chatView');
    if (chatView) {
        chatView.classList.remove('hidden');
    }
    
    const incomingCall = document.getElementById('incomingCall');
    if (incomingCall) {
        incomingCall.classList.add('hidden');
    }
    
    // Clear video elements
    const localVideo = document.getElementById('localVideo');
    if (localVideo) {
        localVideo.srcObject = null;
    }
    
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) {
        remoteVideo.srcObject = null;
    }
    
    // Clear call data
    window.incomingCallData = null;
    window.incomingCallType = null;
    isCallActive = false;
    
    // Reset call-related state
    currentCallType = null;
    currentVideoDeviceId = null;
    isScreenSharing = false;
    isOnHold = false;
    
    // Reset call status
    updateCallStatus('');
    
    // Stop timer
    stopCallTimer();
    
    // Reset UI buttons
    const videoBtn = document.getElementById('videoBtn');
    const muteBtn = document.getElementById('muteBtn');
    if (videoBtn) {
        videoBtn.classList.remove('active');
        videoBtn.style.display = 'flex'; // Reset to default
    }
    if (muteBtn) {
        muteBtn.classList.remove('active');
    }
    
    // Hide call message input
    const callMessageInput = document.getElementById('callMessageInput');
    if (callMessageInput) {
        callMessageInput.classList.add('hidden');
    }
    
    // Show placeholder again
    const remoteVideoPlaceholder = document.getElementById('remoteVideoPlaceholder');
    if (remoteVideoPlaceholder) {
        remoteVideoPlaceholder.style.display = 'flex';
    }
    
    // Stop screen share if active
    if (screenShareStream) {
        screenShareStream.getTracks().forEach(track => track.stop());
        screenShareStream = null;
    }
    
    // Reset button states
    const holdBtn = document.getElementById('holdBtn');
    const screenShareBtn = document.getElementById('screenShareBtn');
    if (holdBtn) holdBtn.classList.remove('active');
    if (screenShareBtn) screenShareBtn.classList.remove('active');
}

function toggleMute() {
    if (localStream) {
        localStream.getAudioTracks().forEach(track => {
            track.enabled = !track.enabled;
        });
        const muteBtn = document.getElementById('muteBtn');
        if (muteBtn) {
            muteBtn.classList.toggle('active');
        }
    }
}

function toggleVideo() {
    // Don't toggle video if it's an audio call
    if (currentCallType === 'audio') {
        console.warn('Cannot toggle video in audio call');
        return;
    }
    
    if (localStream) {
        const videoTracks = localStream.getVideoTracks();
        if (videoTracks.length === 0) {
            console.warn('No video tracks available');
            return;
        }
        
        const isEnabled = videoTracks[0].enabled;
        
        videoTracks.forEach(track => {
            track.enabled = !isEnabled;
        });
        
        const videoBtn = document.getElementById('videoBtn');
        const localVideo = document.getElementById('localVideo');
        if (videoBtn) {
            if (isEnabled) {
                videoBtn.classList.remove('active');
            } else {
                videoBtn.classList.add('active');
            }
        }
        if (localVideo) {
            localVideo.style.display = isEnabled ? 'none' : 'block';
        }
        
        // Update peer connection
        if (peerConnection && videoTracks.length > 0) {
            const sender = peerConnection.getSenders().find(s => 
                s.track && s.track.kind === 'video'
            );
            if (sender) {
                sender.track.enabled = !isEnabled;
            }
        }
    }
}

// Switch camera (front/back)
async function switchCamera() {
    if (!localStream || !currentCallType || currentCallType !== 'video') {
        return;
    }
    
    try {
        // Get available video devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        if (videoDevices.length < 2) {
            showError('profileMessage', 'Only one camera available');
            return;
        }
        
        // Find current device index
        const currentTrack = localStream.getVideoTracks()[0];
        if (!currentTrack) return;
        
        const currentDeviceId = currentTrack.getSettings().deviceId;
        const currentIndex = videoDevices.findIndex(d => d.deviceId === currentDeviceId);
        const nextIndex = (currentIndex + 1) % videoDevices.length;
        const nextDeviceId = videoDevices[nextIndex].deviceId;
        
        // Get new video stream
        const newStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: nextDeviceId } },
            audio: false
        });
        
        const newVideoTrack = newStream.getVideoTracks()[0];
        
        // Update peer connection first
    if (peerConnection) {
            const sender = peerConnection.getSenders().find(s => 
                s.track && s.track.kind === 'video'
            );
            if (sender && newVideoTrack) {
                await sender.replaceTrack(newVideoTrack);
            } else if (newVideoTrack) {
                peerConnection.addTrack(newVideoTrack, localStream);
            }
        }
        
        // Stop old track and replace in local stream
        currentTrack.stop();
        if (localStream) {
            // Remove old track
            localStream.removeTrack(currentTrack);
            // Add new track
            localStream.addTrack(newVideoTrack);
        }
        
        // Update local video
        const localVideo = document.getElementById('localVideo');
        if (localVideo && localStream) {
            localVideo.srcObject = localStream;
        }
        
        currentVideoDeviceId = nextDeviceId;
    } catch (error) {
        console.error('Error switching camera:', error);
        showError('profileMessage', 'Failed to switch camera');
    }
}

// Toggle screen sharing
async function toggleScreenShare() {
    try {
        if (!isScreenSharing) {
            // Start screen sharing
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
            
            screenShareStream = screenStream;
            isScreenSharing = true;
            
            // Replace video track in peer connection
            if (peerConnection && localStream) {
                const videoTrack = screenStream.getVideoTracks()[0];
                const sender = peerConnection.getSenders().find(s => 
                    s.track && s.track.kind === 'video'
                );
                
                if (sender && videoTrack) {
                    await sender.replaceTrack(videoTrack);
                    // Add to local stream for preview
                    const oldVideoTrack = localStream.getVideoTracks()[0];
                    if (oldVideoTrack) {
                        localStream.removeTrack(oldVideoTrack);
                        oldVideoTrack.stop();
                    }
                    localStream.addTrack(videoTrack);
                }
            }
            
            // Update local video
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = localStream;
            }
            
            // Update button
            const screenShareBtn = document.getElementById('screenShareBtn');
            if (screenShareBtn) {
                screenShareBtn.classList.add('active');
            }
            
            // Handle screen share end
            screenStream.getVideoTracks()[0].onended = () => {
                toggleScreenShare(); // This will stop sharing
            };
        } else {
            // Stop screen sharing
            if (screenShareStream) {
                screenShareStream.getTracks().forEach(track => track.stop());
                screenShareStream = null;
            }
            
            // Get camera stream back
            if (localStream && currentCallType === 'video') {
                const videoStream = await navigator.mediaDevices.getUserMedia({
                    video: currentVideoDeviceId ? { deviceId: { exact: currentVideoDeviceId } } : true,
                    audio: false
                });
                
                const videoTrack = videoStream.getVideoTracks()[0];
                
                // Replace in peer connection
                if (peerConnection) {
                    const sender = peerConnection.getSenders().find(s => 
                        s.track && s.track.kind === 'video'
                    );
                    if (sender && videoTrack) {
                        await sender.replaceTrack(videoTrack);
                        // Update local stream
                        const oldVideoTrack = localStream.getVideoTracks()[0];
                        if (oldVideoTrack) {
                            localStream.removeTrack(oldVideoTrack);
                            oldVideoTrack.stop();
                        }
                        localStream.addTrack(videoTrack);
                    }
                }
                
                // Update local video
                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    localVideo.srcObject = localStream;
                }
            }
            
            isScreenSharing = false;
            
            // Update button
            const screenShareBtn = document.getElementById('screenShareBtn');
            if (screenShareBtn) {
                screenShareBtn.classList.remove('active');
            }
        }
    } catch (error) {
        console.error('Error toggling screen share:', error);
        if (error.name === 'NotAllowedError') {
            showError('profileMessage', 'Screen sharing permission denied');
        } else {
            showError('profileMessage', 'Failed to share screen');
        }
    }
}

// Toggle hold
function toggleHold() {
    isOnHold = !isOnHold;
    
    if (localStream) {
        // Mute audio and video when on hold
        localStream.getAudioTracks().forEach(track => {
            track.enabled = !isOnHold;
        });
        localStream.getVideoTracks().forEach(track => {
            track.enabled = !isOnHold;
        });
    }
    
    const holdBtn = document.getElementById('holdBtn');
    if (holdBtn) {
        if (isOnHold) {
            holdBtn.classList.add('active');
            updateCallStatus('On Hold');
        } else {
            holdBtn.classList.remove('active');
            updateCallStatus('Connected');
        }
    }
}

// Toggle call message input
function toggleCallMessageInput() {
    const callMessageInput = document.getElementById('callMessageInput');
    if (callMessageInput) {
        callMessageInput.classList.toggle('hidden');
        if (!callMessageInput.classList.contains('hidden')) {
            const callMessageText = document.getElementById('callMessageText');
            if (callMessageText) {
                callMessageText.focus();
            }
        }
    }
}

// Send message during call
function sendCallMessage() {
    const callMessageText = document.getElementById('callMessageText');
    if (!callMessageText || !currentChatUserId) return;
    
    const content = callMessageText.value.trim();
    if (!content) return;
    
    // Use existing sendMessage function but with call context
    const input = document.getElementById('messageInput');
    if (input) {
        input.value = content;
        sendMessage();
    }
    
    // Clear call message input
    callMessageText.value = '';
    toggleCallMessageInput();
}

async function handleCallAnswer(sdp) {
    if (!peerConnection) {
        console.warn('Received call answer but no peer connection exists');
        return;
    }
    
    try {
        // Handle SDP - it might be an object or string
        let remoteSdp = sdp;
        if (typeof remoteSdp === 'string') {
            try {
                remoteSdp = JSON.parse(remoteSdp);
            } catch (e) {
                console.error('Error parsing SDP string:', e);
                // If parsing fails, try using it as is
            }
        }
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(remoteSdp));
        console.log('Remote description set successfully');
    } catch (error) {
        console.error('Error setting remote description:', error);
        // If we're in a call, try to recover
        if (isCallActive) {
            updateCallStatus('Connection error, retrying...');
            // The connection state change handler will handle reconnection
        }
    }
}

async function handleIceCandidate(candidate) {
    if (!peerConnection) {
        console.warn('Received ICE candidate but no peer connection exists');
        return;
    }
    
    if (!candidate) {
        console.log('ICE candidate gathering complete');
        return;
    }
    
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('ICE candidate added successfully');
    } catch (error) {
        console.error('Error adding ICE candidate:', error);
        // ICE candidate errors are usually not critical, continue
    }
}

// Profile functions
async function updateProfile(e) {
    e.preventDefault();
    const formData = {
        username: document.getElementById('profileUsernameInput').value,
        first_name: document.getElementById('profileFirstName').value,
        last_name: document.getElementById('profileLastName').value,
        bio: document.getElementById('profileBioInput').value
    };
    
    try {
        const response = await fetch(`${API_BASE}/users/me`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            const updatedUser = await response.json();
            currentUser = updatedUser;
            loadUserProfile();
            document.getElementById('editProfileForm').classList.add('hidden');
            showSuccess('Profile updated successfully');
            
            // Update admin nav visibility
            updateAdminNavVisibility();
        } else {
            showError('Profile update failed');
        }
    } catch (error) {
        console.error('Error updating profile:', error);
    }
}

async function changePassword(e) {
    e.preventDefault();
    const oldPassword = document.getElementById('oldPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    
    try {
        const response = await fetch(`${API_BASE}/users/me/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
        });
        
        if (response.ok) {
            showSuccess('Password changed successfully');
            document.getElementById('oldPassword').value = '';
            document.getElementById('newPassword').value = '';
        } else {
            const data = await response.json();
            showError(data.detail || 'Password change failed');
        }
    } catch (error) {
        console.error('Error changing password:', error);
    }
}

async function uploadAvatar(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch(`${API_BASE}/users/me/avatar`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` },
            body: formData
        });
        
        if (response.ok) {
            currentUser = await response.json();
            updateUserInfo();
            showSuccess('Avatar updated successfully');
            
            // Update admin nav visibility
            if (currentUser && currentUser.role === 'admin') {
                document.getElementById('adminNav')?.classList.remove('hidden');
                document.getElementById('adminNavMobile')?.classList.remove('hidden');
                document.getElementById('adminNavMobileBottom')?.classList.remove('hidden');
            }
        }
    } catch (error) {
        console.error('Error uploading avatar:', error);
    }
}

// Admin functions
async function loadAdminUsers() {
    const userList = document.getElementById('adminUserList');
    const loadingEl = document.getElementById('adminUsersLoading');
    const emptyEl = document.getElementById('adminUsersEmpty');
    
    if (!userList) {
        console.error('Admin user list element not found');
        return;
    }
    
    try {
        if (loadingEl) loadingEl.style.display = 'block';
        if (emptyEl) emptyEl.classList.add('hidden');
        
        const response = await fetch(`${API_BASE}/admin/users`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            const users = await response.json();
            
            userList.innerHTML = '';
            
            if (users.length === 0) {
                if (emptyEl) emptyEl.classList.remove('hidden');
                if (loadingEl) loadingEl.style.display = 'none';
                return;
            }
            
            users.forEach(user => {
                const userItem = document.createElement('div');
                userItem.className = 'admin-user-item';
                userItem.dataset.userId = user.id;
                
                const avatarUrl = user.profile_pic 
                    ? `/uploads/${user.profile_pic}` 
                    : '/static/default-avatar.png';
                
                const roleBadge = user.role === 'admin' 
                    ? '<span class="role-badge admin-badge">Admin</span>' 
                    : '<span class="role-badge user-badge">User</span>';
                
                const statusBadge = user.is_active 
                    ? '<span class="status-badge active">Active</span>' 
                    : '<span class="status-badge inactive">Inactive</span>';
                
                userItem.innerHTML = `
                    <div class="admin-user-info">
                        <div class="user-avatar">
                            <img src="${avatarUrl}" 
                                 alt="${user.username}" class="avatar-small"
                                 onerror="this.src='/static/default-avatar.png'">
                        </div>
                        <div class="user-details">
                            <div class="user-name-row">
                                <div class="user-name">${escapeHtml(user.username)}</div>
                                ${roleBadge}
                                ${statusBadge}
                            </div>
                            <div class="user-meta">
                                ${user.first_name || user.last_name ? `${escapeHtml(user.first_name || '')} ${escapeHtml(user.last_name || '')}`.trim() : ''}
                                ${user.first_name || user.last_name ? ' • ' : ''}
                                ID: ${user.id}
                            </div>
                        </div>
                    </div>
                    <div class="admin-user-actions">
                        <button class="btn-icon-small" onclick="editUser(${user.id})" title="Edit User">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon-small" onclick="toggleUserActive(${user.id}, ${user.is_active})" 
                                title="${user.is_active ? 'Deactivate' : 'Activate'} User">
                            <i class="fas fa-${user.is_active ? 'ban' : 'check'}"></i>
                        </button>
                        <button class="btn-icon-small btn-danger" onclick="deleteUser(${user.id}, '${escapeHtml(user.username)}')" 
                                title="Delete User" ${user.id === currentUser?.id ? 'disabled' : ''}>
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
                userList.appendChild(userItem);
            });
            
            if (loadingEl) loadingEl.style.display = 'none';
        } else {
            console.error('Failed to load admin users:', response.status);
            if (loadingEl) loadingEl.style.display = 'none';
            showError('Failed to load users');
        }
    } catch (error) {
        console.error('Error loading admin users:', error);
        if (loadingEl) loadingEl.style.display = 'none';
        showError('Error loading users: ' + error.message);
    }
}

async function loadAuditLogs() {
    if (!currentUser || currentUser.role !== 'admin') return;
    
    const container = document.getElementById('auditLog');
    if (!container) return;
    
    try {
        container.innerHTML = '<div class="loading-message"><i class="fas fa-spinner fa-spin"></i> Loading audit logs...</div>';
        
        const response = await fetch(`${API_BASE}/admin/audit_logs?limit=100`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            const logs = await response.json();
            displayAuditLogs(logs);
        } else {
            container.innerHTML = '<div class="empty-state">Failed to load audit logs</div>';
        }
    } catch (error) {
        console.error('Error loading audit logs:', error);
        if (container) {
            container.innerHTML = '<div class="empty-state">Error loading audit logs</div>';
        }
    }
}

function displayAuditLogs(logs) {
    const container = document.getElementById('auditLog');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (logs.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>No audit logs found</p></div>';
        return;
    }
    
    logs.forEach(log => {
        const logEl = document.createElement('div');
        logEl.className = 'audit-item';
        
        const date = new Date(log.created_at);
        const dateStr = date.toLocaleDateString();
        const timeStr = date.toLocaleTimeString();
        
        logEl.innerHTML = `
            <div class="audit-item-header">
                <span class="audit-item-type">${escapeHtml(log.event_type)}</span>
                <span class="audit-item-time">${dateStr} ${timeStr}</span>
            </div>
            <div class="audit-item-body">
                ${escapeHtml(log.new_value || log.old_value || 'N/A')}
                ${log.user_id ? `<div style="margin-top: 4px; font-size: 11px; color: var(--text-muted);">User ID: ${log.user_id}</div>` : ''}
            </div>
        `;
        container.appendChild(logEl);
    });
}

function switchAdminTab(tab) {
    // Show/hide tab content
    const usersTab = document.getElementById('adminUsersTab');
    const auditTab = document.getElementById('adminAuditTab');
    
    if (usersTab) {
        usersTab.classList.toggle('hidden', tab !== 'users');
    }
    if (auditTab) {
        auditTab.classList.toggle('hidden', tab !== 'audit');
    }
    
    // Load data for active tab
    if (tab === 'users') {
        loadAdminUsers();
    } else if (tab === 'audit') {
        loadAuditLogs();
    }
}

function showCreateUserModal() {
    // Reset form
    document.getElementById('createUserForm').reset();
    document.getElementById('editUserId').value = '';
    document.getElementById('createUserModalTitle').textContent = 'Create New User';
    document.getElementById('createUserSubmitBtn').textContent = 'Create User';
    document.getElementById('createPassword').required = true;
    const passwordLabel = document.getElementById('passwordGroup').querySelector('label');
    if (passwordLabel) {
        passwordLabel.textContent = 'Password *';
    }
    document.getElementById('createUserMessage').textContent = '';
    document.getElementById('createUserMessage').className = 'message';
    
    // Show modal
    document.getElementById('createUserModal').classList.remove('hidden');
}

function hideCreateUserModal() {
    document.getElementById('createUserModal').classList.add('hidden');
    // Reset form
    document.getElementById('createUserForm').reset();
    document.getElementById('editUserId').value = '';
}

async function handleCreateOrUpdateUser(e) {
    if (e) e.preventDefault();
    
    const editUserId = document.getElementById('editUserId').value;
    const username = document.getElementById('createUsername').value;
    const password = document.getElementById('createPassword').value;
    const first_name = document.getElementById('createFirstName').value;
    const last_name = document.getElementById('createLastName').value;
    const role = document.getElementById('createRole').value;
    
    if (!username) {
        showError('createUserMessage', 'Username is required');
        return;
    }
    
    // For new users, password is required
    if (!editUserId && !password) {
        showError('createUserMessage', 'Password is required for new users');
        return;
    }
    
    const formData = {
        username: username,
        first_name: first_name || null,
        last_name: last_name || null,
        role: role || 'user'
    };
    
    // Only include password if provided and not empty
    // For new users, password is already validated above
    // For updates, if password is provided, include it; otherwise, don't send it
    if (password && password.trim() !== '') {
        formData.password = password;
    } else if (!editUserId) {
        // For new users, password is required (already validated)
        formData.password = password;
    }
    
    try {
        let response;
        if (editUserId) {
            // Update existing user
            response = await fetch(`${API_BASE}/admin/users/${editUserId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify(formData)
            });
        } else {
            // Create new user
            response = await fetch(`${API_BASE}/admin/users`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify(formData)
            });
        }
        
        if (response.ok) {
            hideCreateUserModal();
            loadAdminUsers();
            showSuccess(editUserId ? 'User updated successfully' : 'User created successfully');
        } else {
            const data = await response.json();
            showError('createUserMessage', data.detail || `Failed to ${editUserId ? 'update' : 'create'} user`);
        }
    } catch (error) {
        console.error(`Error ${editUserId ? 'updating' : 'creating'} user:`, error);
        showError('createUserMessage', `Failed to ${editUserId ? 'update' : 'create'} user. Please try again.`);
    }
}

async function editUser(userId) {
    try {
        const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            const user = await response.json();
            
            // Fill form with user data
            document.getElementById('editUserId').value = user.id;
            document.getElementById('createUsername').value = user.username;
            document.getElementById('createPassword').value = '';
            document.getElementById('createPassword').required = false;
            document.getElementById('createFirstName').value = user.first_name || '';
            document.getElementById('createLastName').value = user.last_name || '';
            document.getElementById('createRole').value = user.role;
            
            // Update modal title and button
            document.getElementById('createUserModalTitle').textContent = 'Edit User';
            document.getElementById('createUserSubmitBtn').textContent = 'Update User';
            document.getElementById('passwordGroup').querySelector('label').textContent = 'Password (leave empty to keep current)';
            
            // Show modal
            showCreateUserModal();
        } else {
            showError('Failed to load user data');
        }
    } catch (error) {
        console.error('Error loading user for edit:', error);
        showError('Error loading user data');
    }
}

async function deleteUser(userId, username) {
    if (!confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            loadAdminUsers();
            showSuccess('User deleted successfully');
        } else {
            const data = await response.json();
            showError(data.detail || 'Failed to delete user');
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        showError('Failed to delete user. Please try again.');
    }
}

async function toggleUserActive(userId, currentStatus) {
    try {
        const response = await fetch(`${API_BASE}/admin/users/${userId}/toggle-active`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            loadAdminUsers();
            showSuccess(data.message || `User ${data.is_active ? 'activated' : 'deactivated'} successfully`);
        } else {
            const data = await response.json();
            showError(data.detail || 'Failed to toggle user status');
        }
    } catch (error) {
        console.error('Error toggling user status:', error);
        showError('Failed to toggle user status. Please try again.');
    }
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function showError(elementId, message) {
    const el = document.getElementById(elementId || 'profileMessage');
    if (!el) {
        console.error('Error element not found:', elementId || 'profileMessage');
        // Fallback: use alert if element not found
        alert(message);
        return;
    }
    el.textContent = message;
    el.className = 'message error';
    setTimeout(() => {
        if (el) {
        el.textContent = '';
        el.className = 'message';
        }
    }, 5000);
}

function showSuccess(message) {
    const el = document.getElementById('profileMessage');
    if (!el) {
        console.warn('Success element not found: profileMessage');
        return;
    }
    el.textContent = message;
    el.className = 'message success';
    setTimeout(() => {
        if (el) {
        el.textContent = '';
        el.className = 'message';
        }
    }, 3000);
}

function filterUsers() {
    filterUsersInList('userList');
}

function filterUsersInList(listId) {
    let search;
    if (listId === 'adminUserList') {
        search = document.getElementById('adminUserSearch')?.value.toLowerCase() || '';
    } else {
        search = document.getElementById('userSearch')?.value.toLowerCase() || '';
    }
    
    const userList = document.getElementById(listId);
    if (!userList) return;
    
    userList.querySelectorAll('.user-item').forEach(item => {
        const name = item.querySelector('.user-name')?.textContent.toLowerCase() || '';
        item.style.display = name.includes(search) ? '' : 'none';
    });
}


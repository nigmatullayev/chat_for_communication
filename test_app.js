/**
 * Test script for app.js
 * Run this in browser console or with Node.js (if DOM APIs are available)
 */

// Mock DOM environment for testing
if (typeof document === 'undefined') {
    console.log('⚠️  This test requires a browser environment');
    console.log('Please run this in browser console after loading the page');
    process.exit(0);
}

console.log('🧪 Starting app.js tests...\n');

// Test results
const testResults = {
    passed: 0,
    failed: 0,
    errors: []
};

function test(name, fn) {
    try {
        fn();
        testResults.passed++;
        console.log(`✅ ${name}`);
    } catch (error) {
        testResults.failed++;
        testResults.errors.push({ name, error: error.message });
        console.error(`❌ ${name}: ${error.message}`);
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

// Test 1: Check if required functions exist
console.log('📋 Testing function existence...\n');

test('checkAuth function exists', () => {
    assert(typeof checkAuth === 'function', 'checkAuth is not a function');
});

test('setupEventListeners function exists', () => {
    assert(typeof setupEventListeners === 'function', 'setupEventListeners is not a function');
});

test('handleLogin function exists', () => {
    assert(typeof handleLogin === 'function', 'handleLogin is not a function');
});

test('loadUserProfile function exists', () => {
    assert(typeof loadUserProfile === 'function', 'loadUserProfile is not a function');
});

test('switchView function exists', () => {
    assert(typeof switchView === 'function', 'switchView is not a function');
});

test('searchUsers function exists', () => {
    assert(typeof searchUsers === 'function', 'searchUsers is not a function');
});

test('loadRecentSearches function exists', () => {
    assert(typeof loadRecentSearches === 'function', 'loadRecentSearches is not a function');
});

test('addToRecentSearches function exists', () => {
    assert(typeof addToRecentSearches === 'function', 'addToRecentSearches is not a function');
});

test('getRecentSearches function exists', () => {
    assert(typeof getRecentSearches === 'function', 'getRecentSearches is not a function');
});

test('saveRecentSearches function exists', () => {
    assert(typeof saveRecentSearches === 'function', 'saveRecentSearches is not a function');
});

test('sendMessage function exists', () => {
    assert(typeof sendMessage === 'function', 'sendMessage is not a function');
});

test('connectWebSocket function exists', () => {
    assert(typeof connectWebSocket === 'function', 'connectWebSocket is not a function');
});

// Test 2: Test Recent Searches functionality
console.log('\n📋 Testing Recent Searches functionality...\n');

test('getRecentSearches returns array', () => {
    const result = getRecentSearches();
    assert(Array.isArray(result), 'getRecentSearches should return an array');
});

test('saveRecentSearches saves data', () => {
    const testData = [{ id: 1, username: 'test', first_name: 'Test', last_name: 'User' }];
    saveRecentSearches(testData);
    const retrieved = getRecentSearches();
    assert(retrieved.length === 1, 'Data should be saved');
    assert(retrieved[0].id === 1, 'Saved data should match');
    // Clean up
    saveRecentSearches([]);
});

test('addToRecentSearches adds user', () => {
    const testUser = {
        id: 999,
        username: 'testuser',
        profile_pic: null,
        first_name: 'Test',
        last_name: 'User'
    };
    addToRecentSearches(testUser);
    const recent = getRecentSearches();
    assert(recent.length > 0, 'User should be added');
    assert(recent[0].id === 999, 'User should be at the beginning');
    // Clean up
    saveRecentSearches([]);
});

test('addToRecentSearches removes duplicates', () => {
    const testUser = {
        id: 888,
        username: 'testuser2',
        profile_pic: null,
        first_name: 'Test',
        last_name: 'User2'
    };
    addToRecentSearches(testUser);
    addToRecentSearches(testUser); // Add same user again
    const recent = getRecentSearches();
    const count = recent.filter(u => u.id === 888).length;
    assert(count === 1, 'Duplicate should be removed');
    // Clean up
    saveRecentSearches([]);
});

test('addToRecentSearches limits to 10 items', () => {
    // Add 12 users
    for (let i = 1; i <= 12; i++) {
        addToRecentSearches({
            id: i,
            username: `user${i}`,
            profile_pic: null,
            first_name: 'Test',
            last_name: 'User'
        });
    }
    const recent = getRecentSearches();
    assert(recent.length === 10, 'Should limit to 10 items');
    // Clean up
    saveRecentSearches([]);
});

// Test 3: Test utility functions
console.log('\n📋 Testing utility functions...\n');

test('escapeHtml function exists', () => {
    assert(typeof escapeHtml === 'function', 'escapeHtml is not a function');
});

test('escapeHtml escapes HTML', () => {
    const result = escapeHtml('<script>alert("xss")</script>');
    assert(!result.includes('<script>'), 'Should escape HTML tags');
    assert(result.includes('&lt;'), 'Should escape < character');
});

test('formatTime function exists', () => {
    assert(typeof formatTime === 'function', 'formatTime is not a function');
});

test('formatTime formats date string', () => {
    const dateStr = '2024-01-01T12:00:00Z';
    const result = formatTime(dateStr);
    assert(typeof result === 'string', 'Should return string');
    assert(result.length > 0, 'Should return formatted time');
});

// Test 4: Test DOM elements
console.log('\n📋 Testing DOM elements...\n');

test('searchInput element exists', () => {
    const element = document.getElementById('searchInput');
    assert(element !== null, 'searchInput element should exist');
});

test('recentSearches element exists', () => {
    const element = document.getElementById('recentSearches');
    assert(element !== null, 'recentSearches element should exist');
});

test('recentSearchesList element exists', () => {
    const element = document.getElementById('recentSearchesList');
    assert(element !== null, 'recentSearchesList element should exist');
});

test('clearSearchBtn element exists', () => {
    const element = document.getElementById('clearSearchBtn');
    assert(element !== null, 'clearSearchBtn element should exist');
});

test('clearAllRecentBtn element exists', () => {
    const element = document.getElementById('clearAllRecentBtn');
    assert(element !== null, 'clearAllRecentBtn element should exist');
});

// Test 5: Test loadRecentSearches
console.log('\n📋 Testing loadRecentSearches function...\n');

test('loadRecentSearches handles empty list', () => {
    saveRecentSearches([]);
    loadRecentSearches();
    const recentSearches = document.getElementById('recentSearches');
    assert(recentSearches.classList.contains('hidden'), 'Should hide when empty');
});

test('loadRecentSearches displays items', () => {
    const testUsers = [
        { id: 1, username: 'user1', profile_pic: null, first_name: 'User', last_name: 'One' },
        { id: 2, username: 'user2', profile_pic: null, first_name: 'User', last_name: 'Two' }
    ];
    saveRecentSearches(testUsers);
    loadRecentSearches();
    const recentSearches = document.getElementById('recentSearches');
    const recentSearchesList = document.getElementById('recentSearchesList');
    assert(!recentSearches.classList.contains('hidden'), 'Should show when has items');
    assert(recentSearchesList.children.length === 2, 'Should display 2 items');
    // Clean up
    saveRecentSearches([]);
});

// Test 6: Test removeFromRecentSearches
console.log('\n📋 Testing removeFromRecentSearches function...\n');

test('removeFromRecentSearches removes user', () => {
    const testUsers = [
        { id: 1, username: 'user1', profile_pic: null, first_name: 'User', last_name: 'One' },
        { id: 2, username: 'user2', profile_pic: null, first_name: 'User', last_name: 'Two' }
    ];
    saveRecentSearches(testUsers);
    removeFromRecentSearches(1);
    const recent = getRecentSearches();
    assert(recent.length === 1, 'Should remove one user');
    assert(recent[0].id === 2, 'Should keep the other user');
    // Clean up
    saveRecentSearches([]);
});

// Test 7: Test clearAllRecentSearches
console.log('\n📋 Testing clearAllRecentSearches function...\n');

test('clearAllRecentSearches clears all', () => {
    const testUsers = [
        { id: 1, username: 'user1', profile_pic: null, first_name: 'User', last_name: 'One' },
        { id: 2, username: 'user2', profile_pic: null, first_name: 'User', last_name: 'Two' }
    ];
    saveRecentSearches(testUsers);
    clearAllRecentSearches();
    const recent = getRecentSearches();
    assert(recent.length === 0, 'Should clear all users');
});

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 Test Summary:');
console.log(`✅ Passed: ${testResults.passed}`);
console.log(`❌ Failed: ${testResults.failed}`);
console.log('='.repeat(50));

if (testResults.errors.length > 0) {
    console.log('\n❌ Errors:');
    testResults.errors.forEach(({ name, error }) => {
        console.log(`  - ${name}: ${error}`);
    });
}

if (testResults.failed === 0) {
    console.log('\n🎉 All tests passed!');
} else {
    console.log(`\n⚠️  ${testResults.failed} test(s) failed`);
}


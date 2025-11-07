#!/bin/bash
# Comprehensive QA Test Runner Script

echo "=========================================="
echo "Chat+Video Application - QA Test Suite"
echo "=========================================="
echo ""

# Check if server is running
echo "Checking if server is running..."
if curl -s http://localhost:8030/api/health > /dev/null 2>&1; then
    echo "✓ Server is running on port 8030"
else
    echo "⚠ Server is not running on port 8030"
    echo "Please start the server:"
    echo "  uvicorn backend.main:app --reload --host 0.0.0.0 --port 8030"
    echo ""
    read -p "Do you want to continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "Running comprehensive QA tests..."
echo ""

# Run Python tests
python3 comprehensive_qa_test.py

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ All tests passed!"
    echo "=========================================="
    exit 0
else
    echo ""
    echo "=========================================="
    echo "❌ Some tests failed!"
    echo "=========================================="
    exit 1
fi


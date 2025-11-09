#!/bin/bash
# Helper script to analyze debug logs

LOGFILE="../debug.log"

echo "=== Debug Log Analyzer ==="
echo ""

# Check if log file exists
if [ ! -f "$LOGFILE" ]; then
    echo "❌ No debug.log file found!"
    echo "Run the app and chat with GPT first to generate logs."
    exit 1
fi

# Get file size
FILESIZE=$(du -h "$LOGFILE" | cut -f1)
echo "📊 Log file size: $FILESIZE"

# Count total lines
LINES=$(wc -l < "$LOGFILE")
echo "📝 Total lines: $LINES"
echo ""

echo "=== Recent Activity ==="
echo ""

# Show last ICT request
echo "🔍 Last ICT Analysis Parameters:"
grep -A 10 "ICT Analysis Parameters" "$LOGFILE" | tail -12
echo ""

# Show last date range
echo "📅 Last Date Range Analyzed:"
grep "dateRangeSpan" "$LOGFILE" | tail -1
echo ""

# Show last token usage
echo "💰 Last Token Usage:"
grep "Combined usage" "$LOGFILE" | tail -1
echo ""

# Show last response
echo "💬 Last GPT Response:"
grep "replyPreview" "$LOGFILE" | tail -1
echo ""

echo "=== Quick Commands ==="
echo ""
echo "View full log:           cat $LOGFILE"
echo "Watch live:              tail -f $LOGFILE"
echo "Search for symbol:       grep 'symbol.*AAPL' $LOGFILE"
echo "Find all date ranges:    grep dateRangeSpan $LOGFILE"
echo "Find all token usage:    grep 'Combined usage' $LOGFILE"
echo "Clear log:               > $LOGFILE"
echo ""

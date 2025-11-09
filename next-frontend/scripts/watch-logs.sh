#!/bin/bash
# Simple script to watch logs in real-time with nice formatting

LOGFILE="../debug.log"

# Create log file if it doesn't exist
touch "$LOGFILE"

echo "👀 Watching debug.log for changes..."
echo "Press Ctrl+C to stop"
echo ""
echo "=== Log Stream ==="
echo ""

# Follow the log file
tail -f "$LOGFILE" | while read line; do
    # Color-code different log levels
    if [[ $line == *"[ERROR]"* ]]; then
        echo -e "\033[0;31m$line\033[0m"  # Red for errors
    elif [[ $line == *"[DEBUG]"* ]]; then
        echo -e "\033[0;36m$line\033[0m"  # Cyan for debug
    elif [[ $line == "==="* ]]; then
        echo -e "\033[1;33m$line\033[0m"  # Bold yellow for sections
    else
        echo "$line"
    fi
done

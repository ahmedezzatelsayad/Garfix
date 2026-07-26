#!/bin/bash
cd /home/z/my-project
export NODE_ENV=development

# Keep trying to run the server, restart if it crashes
while true; do
  echo "Starting Next.js dev server (webpack mode)..."
  npx next dev -p 3000 --webpack
  echo "Server process exited, restarting in 5s..."
  sleep 5
done

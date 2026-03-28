@echo off
cd /d "C:\Users\snahrup\CascadeProjects\Auto-Claude\apps\backend"
"C:\Users\snahrup\CascadeProjects\Auto-Claude\apps\backend\.venv\Scripts\pythonw.exe" -m daemon.serve --port 8400 --company "Phantom Trading Co." > "C:\Users\snahrup\CascadeProjects\phantomx\axon-daemon.log" 2>&1

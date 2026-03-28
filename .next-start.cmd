@echo off
set PATH=C:\Users\snahrup\AppData\Roaming\fnm\node-versions\v22.22.0\installation;%PATH%
cd /d "C:\Users\snahrup\CascadeProjects\phantomx"
"C:\Users\snahrup\AppData\Roaming\fnm\node-versions\v22.22.0\installation\npm.cmd" run dev > "C:\Users\snahrup\CascadeProjects\phantomx\nextjs-dev.log" 2>&1

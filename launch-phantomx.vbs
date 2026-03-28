' PhantomX — Silent Launcher v2
' Starts Axon daemon (:8400) + Next.js dev server (:3000), then opens browser.
' ZERO terminal windows — all processes run fully hidden.
'
' Shortcut target: wscript.exe "C:\Users\snahrup\CascadeProjects\phantomx\launch-phantomx.vbs"

Option Explicit

Dim ws, fso, phantomxDir, axonDir, logFile, node22, pythonExe

Set ws = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

phantomxDir = "C:\Users\snahrup\CascadeProjects\phantomx"
axonDir = "C:\Users\snahrup\CascadeProjects\Auto-Claude\apps\backend"
logFile = phantomxDir & "\phantomx-launch.log"

' Node 22 for Next.js compatibility
node22 = "C:\Users\snahrup\AppData\Roaming\fnm\node-versions\v22.22.0\installation"
pythonExe = axonDir & "\.venv\Scripts\pythonw.exe"

' Use pythonw.exe (no console window) if available, fall back to python.exe
If Not fso.FileExists(pythonExe) Then
    pythonExe = axonDir & "\.venv\Scripts\python.exe"
End If

Sub Log(msg)
    Dim f
    Set f = fso.OpenTextFile(logFile, 8, True)
    f.WriteLine Now() & " | " & msg
    f.Close
End Sub

Function IsPortInUse(port)
    Dim exec, output
    Set exec = ws.Exec("cmd /c netstat -ano 2>nul | findstr /C:"":" & port & " "" | findstr LISTENING")
    output = exec.StdOut.ReadAll
    IsPortInUse = (Len(Trim(output)) > 0)
End Function

' Kill a port silently using a hidden .cmd file (no flash)
Sub KillPort(port)
    Dim batPath, f
    batPath = phantomxDir & "\.kill-port.cmd"
    Set f = fso.CreateTextFile(batPath, True)
    f.Write "@echo off" & vbCrLf & _
            "for /f ""tokens=5"" %%a in ('netstat -ano ^| findstr :" & port & " ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1" & vbCrLf
    f.Close
    ws.Run """" & batPath & """", 0, True
    WScript.Sleep 500
End Sub

' Run a .cmd file completely hidden (window style 0)
Sub RunHiddenCmd(batPath, contents)
    Dim f
    Set f = fso.CreateTextFile(batPath, True)
    f.Write contents
    f.Close
    ws.Run """" & batPath & """", 0, False
End Sub

' ══════════════════════════════════════════════════════════
' Step 1: Start Axon Daemon (port 8400)
' ══════════════════════════════════════════════════════════
If IsPortInUse(8400) Then
    Log "Axon daemon already running on :8400 — skipping"
Else
    Log "Starting Axon daemon on :8400..."
    KillPort 8400

    Dim axonBat
    axonBat = "@echo off" & vbCrLf _
            & "cd /d """ & axonDir & """" & vbCrLf _
            & """" & pythonExe & """ -m daemon.serve --port 8400 --company ""Phantom Trading Co."" > """ & phantomxDir & "\axon-daemon.log"" 2>&1" & vbCrLf

    RunHiddenCmd phantomxDir & "\.axon-start.cmd", axonBat
    Log "Axon daemon launched (background)"

    ' Wait for daemon to be ready (up to 30 seconds)
    Dim axonAttempts
    axonAttempts = 0
    Do While axonAttempts < 15
        WScript.Sleep 2000
        axonAttempts = axonAttempts + 1
        If IsPortInUse(8400) Then Exit Do
    Loop

    If IsPortInUse(8400) Then
        Log "Axon daemon ready on :8400"
    Else
        Log "WARNING: Axon daemon may not have started — continuing anyway"
    End If
End If

' ══════════════════════════════════════════════════════════
' Step 2: Start Next.js Dev Server (port 3000)
' ══════════════════════════════════════════════════════════
If IsPortInUse(3000) Then
    Log "Next.js already running on :3000 — skipping"
Else
    Log "Starting PhantomX Next.js dev server on :3000..."
    KillPort 3000

    Dim nextBat
    nextBat = "@echo off" & vbCrLf _
            & "set PATH=" & node22 & ";%PATH%" & vbCrLf _
            & "cd /d """ & phantomxDir & """" & vbCrLf _
            & """" & node22 & "\npm.cmd"" run dev > """ & phantomxDir & "\nextjs-dev.log"" 2>&1" & vbCrLf

    RunHiddenCmd phantomxDir & "\.next-start.cmd", nextBat
    Log "Next.js dev server launched (background)"

    ' Wait for Next.js to be ready (up to 45 seconds)
    Dim nextAttempts
    nextAttempts = 0
    Do While nextAttempts < 22
        WScript.Sleep 2000
        nextAttempts = nextAttempts + 1
        If IsPortInUse(3000) Then Exit Do
    Loop

    If IsPortInUse(3000) Then
        Log "Next.js dev server ready on :3000"
    Else
        Log "WARNING: Next.js may still be compiling — opening browser anyway"
    End If
End If

' ══════════════════════════════════════════════════════════
' Step 3: Open Browser (using Shell.Application — no cmd flash)
' ══════════════════════════════════════════════════════════
WScript.Sleep 2000
Dim shell
Set shell = CreateObject("Shell.Application")
shell.ShellExecute "http://localhost:3000", "", "", "open", 1
Log "Browser opened. PhantomX is live."

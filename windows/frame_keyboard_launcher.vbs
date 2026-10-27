' Starts the injector without any window (a hidden PowerShell console can still flash or stay on
' screen when it is started by a Scheduled Task; wscript can run it with window style 0).
Set shell = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & dir & "\frame_keyboard_injector.ps1"" -Bundle """ & dir & "\bundle.js""", 0, False

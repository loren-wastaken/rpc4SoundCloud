' rpc4SoundCloud — start-relay.vbs
'
' Runs the relay server silently in the background (no console window),
' so it can be dropped into Windows' Startup folder and just work every
' time you log in.

Set WshShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir
WshShell.Run "cmd /c npm start", 0, False
# Registers the Windows scheduled task "CampWebsite crawler".
#   - runs `python crawl.py run` from the repo root, daily at 05:30 and then every 6 hours
#   - hidden: pythonw.exe has no console window, and the task runs in the background, so it never takes focus
# Run once, by hand:  powershell -ExecutionPolicy Bypass -File crawler\install-task.ps1
# Remove it:          Unregister-ScheduledTask -TaskName "CampWebsite crawler" -Confirm:$false
param(
    [string]$TaskName = "CampWebsite crawler",
    [string]$Time = "05:30"
)
$ErrorActionPreference = "Stop"

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$python = (Get-Command python -ErrorAction Stop).Source
# pythonw.exe sits next to python.exe: same interpreter, no console window
$pythonw = Join-Path (Split-Path $python) "pythonw.exe"
if (-not (Test-Path $pythonw)) { $pythonw = $python }

$action = New-ScheduledTaskAction -Execute $pythonw -Argument "crawler\crawl.py run" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
# repeat every 6 hours, all day
$trigger.Repetition = (New-ScheduledTaskTrigger -Once -At $Time -RepetitionInterval (New-TimeSpan -Hours 6) `
        -RepetitionDuration (New-TimeSpan -Hours 24)).Repetition
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -Hidden -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
    -Description "Crawls RTG campsites + availability into data/ and pushes when something changed (see crawler/README.md)" `
    -Force | Out-Null
Write-Host "Registered '$TaskName': $pythonw crawler\crawl.py run, in $repo, daily $Time then every 6h."
Write-Host "Check: Get-ScheduledTask -TaskName '$TaskName' | Get-ScheduledTaskInfo ; log: crawler\runs.log"

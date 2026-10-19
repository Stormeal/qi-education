# Runs `db:backup` or `db:restore` (US-P017) against the shared MongoDB from this PC.
# Node cannot make its own DNS queries on a network that only lets the Windows resolver through
# (ProtonVPN on Alex's PC, 2026-10-19), so the `mongodb+srv://` address fails with querySrv
# ETIMEOUT. This script looks the cluster up through Windows and hands Node the equivalent
# standard `mongodb://` address. It runs in its own process: the address with its password is
# never printed, written to disk or left in the calling session.
#
#   powershell -ExecutionPolicy Bypass -File scripts\mongodb-backup.ps1 -Action backup -Out C:\Users\Alex\qi-backups\<name>
#   powershell -ExecutionPolicy Bypass -File scripts\mongodb-backup.ps1 -Action restore -From <folder> -Into <database>
param(
  [Parameter(Mandatory)][ValidateSet('backup', 'restore')][string]$Action,
  [string]$Out,
  [string]$From,
  [string]$Into
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$commandArgs = if ($Action -eq 'backup') { @('--out', $Out) } else { @('--from', $From, '--into', $Into) }

$line = Get-Content (Join-Path $root 'api\.env') | Where-Object { $_ -match '^MONGODB_URI=' } | Select-Object -First 1
if (-not $line) { Write-Error 'api\.env has no MONGODB_URI. Run npm.cmd run env:pull first.' }
$uri = ($line -replace '^MONGODB_URI=', '').Trim('"')
if ($uri -match '^mongodb\+srv://([^@]+)@([^/?]+)(/[^?]*)?(\?.*)?$') {
  $credentials = $Matches[1]; $cluster = $Matches[2]
  $path = if ($Matches[3]) { $Matches[3] } else { '/' }
  $query = if ($Matches[4]) { $Matches[4].TrimStart('?') } else { '' }
  $hosts = (Resolve-DnsName -Type SRV "_mongodb._tcp.$cluster" | Where-Object Type -eq 'SRV' |
    ForEach-Object { "$($_.NameTarget):$($_.Port)" }) -join ','
  $txt = (Resolve-DnsName -Type TXT $cluster | Where-Object Type -eq 'TXT').Strings -join '&'
  # Atlas SRV addresses imply TLS; the TXT record carries authSource and replicaSet.
  $uri = "mongodb://$credentials@$hosts$path`?" + ((@('tls=true', $txt, $query) | Where-Object { $_ }) -join '&')
}
# Shell values win over api\.env, so the API configuration picks these up.
$env:MONGODB_URI = $uri
$env:USE_SHARED_SERVICES = '1'
& npm.cmd --prefix (Join-Path $root 'api') run "db:$Action" -- @commandArgs
exit $LASTEXITCODE

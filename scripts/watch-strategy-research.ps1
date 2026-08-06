param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$EvaluationId,

  [int]$RefreshSeconds = 10
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$evaluationDirectory = Join-Path $projectRoot "data\strategy-evaluations\$EvaluationId"

function Get-NdjsonCount {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return 0
  }

  return (Get-Content -LiteralPath $Path | Measure-Object -Line).Lines
}

function Get-LastJsonRecord {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  $line = Get-Content -LiteralPath $Path -Tail 1
  if ([string]::IsNullOrWhiteSpace($line)) {
    return $null
  }

  try {
    return $line | ConvertFrom-Json
  }
  catch {
    return $null
  }
}

while ($true) {
  Clear-Host
  Write-Host 'Strategy Research Dashboard'
  Write-Host "Evaluation: $EvaluationId"
  Write-Host "Directory: $evaluationDirectory"
  Write-Host 'READ ONLY | PAPER ONLY | EXECUTION DISABLED'
  Write-Host ('=' * 72)

  if (-not (Test-Path -LiteralPath $evaluationDirectory)) {
    Write-Host 'Waiting for the evaluation directory to be created...'
    Start-Sleep -Seconds $RefreshSeconds
    continue
  }

  $candidatePath = Join-Path $evaluationDirectory 'strategy-candidates.ndjson'
  $qualificationPath = Join-Path $evaluationDirectory 'strategy-qualifications.ndjson'
  $outcomePath = Join-Path $evaluationDirectory 'strategy-outcomes.ndjson'
  $whalePath = Join-Path $evaluationDirectory 'whale-incremental-observations.ndjson'

  $candidateCount = Get-NdjsonCount -Path $candidatePath
  $qualificationCount = Get-NdjsonCount -Path $qualificationPath
  $outcomeCount = Get-NdjsonCount -Path $outcomePath
  $whaleCount = Get-NdjsonCount -Path $whalePath

  Write-Host ("Strategy candidates:              {0}" -f $candidateCount)
  Write-Host ("Qualification decisions:          {0}" -f $qualificationCount)
  Write-Host ("Completed strategy outcomes:       {0}" -f $outcomeCount)
  Write-Host ("Whale incremental observations:    {0}" -f $whaleCount)
  Write-Host ''

  $lastQualification = Get-LastJsonRecord -Path $qualificationPath
  if ($null -ne $lastQualification) {
    Write-Host 'Latest qualification record:'
    $lastQualification | ConvertTo-Json -Depth 8
    Write-Host ''
  }

  $lastOutcome = Get-LastJsonRecord -Path $outcomePath
  if ($null -ne $lastOutcome) {
    Write-Host 'Latest completed outcome:'
    $lastOutcome | ConvertTo-Json -Depth 8
    Write-Host ''
  }

  Write-Host "Refresh: every $RefreshSeconds second(s). Press Ctrl+C to stop."
  Start-Sleep -Seconds $RefreshSeconds
}

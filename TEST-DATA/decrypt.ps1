#Requires -Version 7.0

# Set strict error handling
$ErrorActionPreference = 'Stop'

# Get the script directory and change to it
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $scriptDir

try {
    # Check if age command is available
    if (-not (Get-Command -Name age -ErrorAction SilentlyContinue)) {
        Write-Error "Error: age command not found in PATH" -ErrorAction Stop
    }

    # Decrypt message.age
    Write-Host "Decrypting message..."
    age --decrypt -i id -o message.plain.txt message.age
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Decrypted message:"
        Get-Content message.plain.txt
        Write-Host ""
    }
    else {
        Write-Error "Decryption failed with exit code $LASTEXITCODE" -ErrorAction Stop
    }

    # Decrypt message-pq.age
    Write-Host "Decrypting PQ encrypted message..."
    age --decrypt -i id-pq -o message.plain-pq.txt message-pq.age
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Decrypted message:"
        Get-Content message.plain-pq.txt
        Write-Host ""
    }
    else {
        Write-Error "Decryption failed with exit code $LASTEXITCODE" -ErrorAction Stop
    }

    # Decrypt Multi Classic encrypted message
    Write-Host "Decrypting Multi Classic encrypted message..."
    age --decrypt -i id -o message.plain-multi-classic.txt message-multi.age
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Decrypted message:"
        Get-Content message.plain-multi-classic.txt
        Write-Host ""
    }
    else {
        Write-Error "Decryption failed with exit code $LASTEXITCODE" -ErrorAction Stop
    }

    # Decrypt Multi PQ encrypted message
    Write-Host "Decrypting Multi PQ encrypted message..."
    age --decrypt -i id-pq -o message.plain-multi-pq.txt message-multi.age
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Decrypted message:"
        Get-Content message.plain-multi-pq.txt
        Write-Host ""
    }
    else {
        Write-Error "Decryption failed with exit code $LASTEXITCODE" -ErrorAction Stop
    }
}
finally {
    Pop-Location
}

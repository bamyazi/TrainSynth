# TrainSynth server
$port = 8090
Write-Host "Starting TrainSynth on http://localhost:$port" -ForegroundColor Cyan

# Use Python if available
$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    python -m http.server $port
} else {
    $npx = Get-Command npx -ErrorAction SilentlyContinue
    if ($npx) {
        npx http-server -p $port -c-1
    } else {
        Write-Host "Install Python or Node.js to serve files" -ForegroundColor Red
    }
}

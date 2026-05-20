$ErrorActionPreference = 'Stop'
$base = 'http://localhost:5000/api'
$report = @()

function Add-Report($name, $status, $detail) {
    $script:report += [pscustomobject]@{ Step = $name; Status = $status; Detail = $detail }
}

# ── 1. Admin login ──────────────────────────────────────────────────────────
try {
    $login = Invoke-RestMethod -Method Post -Uri "$base/auth/admin-login" `
        -ContentType 'application/json' `
        -Body (@{ email = 'superadmin@flexcart.com'; password = 'SuperAdmin@2024' } | ConvertTo-Json)
    if (-not $login.success) { throw 'Login returned success=false' }
    $token   = $login.data.accessToken
    $headers = @{ Authorization = "Bearer $token" }
    Add-Report 'Admin login' 'PASS' ("role=" + $login.data.user.role)
} catch {
    Add-Report 'Admin login' 'FAIL' $_.Exception.Message
    $report | Format-Table -AutoSize
    exit 1
}

$suffix = Get-Date -Format 'HHmmss'

# ── 2. Create hubs ──────────────────────────────────────────────────────────
try {
    $hubA = Invoke-RestMethod -Method Post -Uri "$base/delivery/hubs" -Headers $headers `
        -ContentType 'application/json' `
        -Body (@{ name = "Hub-$suffix-A"; location = "Location-$suffix-A" } | ConvertTo-Json)
    $hubB = Invoke-RestMethod -Method Post -Uri "$base/delivery/hubs" -Headers $headers `
        -ContentType 'application/json' `
        -Body (@{ name = "Hub-$suffix-B"; location = "Location-$suffix-B" } | ConvertTo-Json)
    Add-Report 'Create hubs' 'PASS' ("ids=" + $hubA.data.id + ',' + $hubB.data.id)
} catch {
    Add-Report 'Create hubs' 'FAIL' $_.Exception.Message
}

# ── 3. List hubs ────────────────────────────────────────────────────────────
$hubIds = @()
try {
    $hubs   = Invoke-RestMethod -Method Get -Uri "$base/delivery/hubs" -Headers $headers
    $hubIds = @($hubs.data | Select-Object -Last 2 | ForEach-Object { $_.id })
    Add-Report 'List hubs' 'PASS' ("count=" + ($hubs.data | Measure-Object).Count)
} catch {
    Add-Report 'List hubs' 'FAIL' $_.Exception.Message
}

# ── 4. Create route ─────────────────────────────────────────────────────────
$routeId = $null
try {
    $route   = Invoke-RestMethod -Method Post -Uri "$base/delivery/routes" -Headers $headers `
        -ContentType 'application/json' `
        -Body (@{ from_location = "From-$suffix"; to_location = "To-$suffix"; hub_ids = $hubIds } | ConvertTo-Json)
    $routeId = $route.data.id
    Add-Report 'Create route' 'PASS' ("routeId=" + $routeId)
} catch {
    Add-Report 'Create route' 'FAIL' $_.Exception.Message
}

# ── 5. List routes ──────────────────────────────────────────────────────────
try {
    $routes = Invoke-RestMethod -Method Get -Uri "$base/delivery/routes" -Headers $headers
    Add-Report 'List routes' 'PASS' ("count=" + ($routes.data | Measure-Object).Count)
} catch {
    Add-Report 'List routes' 'FAIL' $_.Exception.Message
}

# ── 6. Find assignable order ────────────────────────────────────────────────
$orderNumber = $null
try {
    $orders    = Invoke-RestMethod -Method Get -Uri "$base/staff-admin/orders?limit=20&page=1" -Headers $headers
    $candidate = $orders.data | Where-Object { $_.status -notin @('cancelled','returned','delivered') } | Select-Object -First 1
    if ($null -ne $candidate) {
        $orderNumber = $candidate.order_number
        Add-Report 'Find assignable order' 'PASS' ("order=" + $orderNumber)
    } else {
        Add-Report 'Find assignable order' 'WARN' 'No eligible order found'
    }
} catch {
    Add-Report 'Find assignable order' 'FAIL' $_.Exception.Message
}

# ── 7. Assign route to order ────────────────────────────────────────────────
if ($orderNumber -and $routeId) {
    try {
        Invoke-RestMethod -Method Post -Uri "$base/delivery/assign-route" -Headers $headers `
            -ContentType 'application/json' `
            -Body (@{ orderNumber = $orderNumber; routeId = $routeId } | ConvertTo-Json) | Out-Null
        Add-Report 'Assign route to order' 'PASS' $orderNumber
    } catch {
        Add-Report 'Assign route to order' 'FAIL' $_.Exception.Message
    }
} else {
    Add-Report 'Assign route to order' 'WARN' 'Skipped (missing order or route)'
}

# ── 8. Assign vehicle to order ──────────────────────────────────────────────
if ($orderNumber) {
    try {
        $vehicles = Invoke-RestMethod -Method Get -Uri "$base/staff-admin/vehicles" -Headers $headers
        $vehicle  = $vehicles.data | Where-Object { $_.is_active -eq 1 -or $_.is_active -eq $true } | Select-Object -First 1
        if ($vehicle) {
            Invoke-RestMethod -Method Post -Uri "$base/delivery/assign-vehicle" -Headers $headers `
                -ContentType 'application/json' `
                -Body (@{ orderNumber = $orderNumber; vehiclePlate = $vehicle.plate_number } | ConvertTo-Json) | Out-Null
            Add-Report 'Assign vehicle to order' 'PASS' ("plate=" + $vehicle.plate_number)
        } else {
            Add-Report 'Assign vehicle to order' 'WARN' 'No active vehicle found'
        }
    } catch {
        Add-Report 'Assign vehicle to order' 'FAIL' $_.Exception.Message
    }
} else {
    Add-Report 'Assign vehicle to order' 'WARN' 'Skipped (missing order)'
}

# ── 9. Get tracking timeline ────────────────────────────────────────────────
if ($orderNumber) {
    try {
        $timeline = Invoke-RestMethod -Method Get -Uri "$base/delivery/tracking/$orderNumber" -Headers $headers
        $count    = ($timeline.data.timeline | Measure-Object).Count
        Add-Report 'Get tracking timeline' 'PASS' ("events=" + $count)
    } catch {
        Add-Report 'Get tracking timeline' 'FAIL' $_.Exception.Message
    }
} else {
    Add-Report 'Get tracking timeline' 'WARN' 'Skipped (missing order)'
}

# ── 10. Update tracking status ──────────────────────────────────────────────
if ($orderNumber) {
    try {
        Invoke-RestMethod -Method Post -Uri "$base/delivery/tracking/status" -Headers $headers `
            -ContentType 'application/json' `
            -Body (@{ orderNumber = $orderNumber; status = 'in_transit'; location = 'Smoke Checkpoint' } | ConvertTo-Json) | Out-Null
        Add-Report 'Update tracking status' 'PASS' 'in_transit'
    } catch {
        Add-Report 'Update tracking status' 'FAIL' $_.Exception.Message
    }
} else {
    Add-Report 'Update tracking status' 'WARN' 'Skipped (missing order)'
}

# ── Summary ─────────────────────────────────────────────────────────────────
Write-Output ''
$report | Format-Table -AutoSize

$fails = ($report | Where-Object { $_.Status -eq 'FAIL' }).Count
Write-Output "FAILS: $fails"
exit $fails

# ANTIGRAVITY HRMS — GPS ATTENDANCE SECURITY & LIMITATIONS SPECIFICATION

> **Phase 8 Architectural Reference & Risk Analysis**  
> **Document Version**: 1.0.0  
> **Status**: Production Grade  
> **Classification**: Security & Compliance Technical Guide  

---

## 1. Executive Summary

The GPS Attendance module in **Antigravity HRMS** provides location-verified time tracking using browser-based Geolocation and server-side geofencing. This document formalizes the threat model, explains the mathematics behind geodesic validation, outlines error handling behaviors, details browser-level GPS spoofing limitations, and defines the multi-layered defense mechanisms implemented across the platform.

---

## 2. Geodesic Mathematics & Server-Side Verification

### 2.1 The Zero-Trust Client Model
A core security principle in Antigravity HRMS is: **Never trust the client**.
- The client application transmits raw measurements: `latitude`, `longitude`, and `accuracy` (in meters).
- The client **never** computes or asserts whether it is "inside" the worksite.
- The server independently calculates the great-circle distance to the target worksite using the **Haversine formula**.

### 2.2 The Haversine Formula
Given the coordinates of the employee $(\phi_1, \lambda_1)$ and the worksite $(\phi_2, \lambda_2)$ in radians:

$$\Delta\phi = \phi_2 - \phi_1$$
$$\Delta\lambda = \lambda_2 - \lambda_1$$
$$a = \sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)$$
$$c = 2 \cdot \text{atan2}\left(\sqrt{a}, \sqrt{1 - a}\right)$$
$$d = R \cdot c$$

Where:
- $R \approx 6,371,000 \text{ m}$ (mean Earth radius).
- $d$ is the geodesic distance in meters.

Attendance is rejected with HTTP `400 Bad Request` if $d > \text{radiusMeters}$.

---

## 3. Handling Geolocation States & Failures

The system handles all standard W3C Geolocation API states both client-side (for UX) and server-side (for security):

| State / Error | W3C Code | Root Cause | Client UX Treatment | Server Enforcement |
|---|---|---|---|---|
| **PERMISSION_DENIED** | `1` | User declined location permission or browser policy blocks origin. | Displays clear visual alert with step-by-step instructions to unlock location in URL bar settings. | Rejects requests with missing or empty coordinates. |
| **POSITION_UNAVAILABLE** | `2` | GPS satellites blocked, cellular/Wi-Fi positioning service down. | Informs user that positioning signal is lost; suggests stepping near windows or connecting to Wi-Fi. | Coordinates are not submitted; attendance cannot be completed without valid fix. |
| **TIMEOUT** | `3` | Device took longer than 15,000ms to obtain fix. | Provides an instant "Thử lại" (Retry) action with high-accuracy mode enabled. | N/A (client retry). |
| **OUTSIDE_RADIUS** | N/A | Calculated distance $d > \text{radiusMeters}$. | Visual radar badge turns Amber/Red; indicates exact distance and excess meters. Submit buttons disabled. | Server recalculates distance and rejects with `400 Bad Request`. |
| **INACCURATE_LOCATION** | N/A | Reported `accuracy` exceeds acceptable threshold (e.g. $> 150\text{m}$). | Alert prompts user to move to an open area to improve satellite reception. Submit buttons disabled. | Server checks `accuracy > maxAllowedAccuracy` and rejects with `400 Bad Request`. |

---

## 4. GPS Accuracy Threshold Analysis

The `accuracy` attribute in the Geolocation API represents the radius (in meters) of a 95% confidence circle: the true physical location has a 95% probability of lying within that circle.

> [!WARNING]
> **The Accuracy Trap**: If an allowed worksite radius is 100 meters, but the client reports an accuracy of $\pm 250\text{ meters}$, a point technically calculated at 20 meters from the worksite center could physically be 270 meters away!

### Server Accuracy Rule:
The server computes the maximum allowable accuracy:
$$\text{maxAccuracy} = \min\left(150, \max(50, \text{round}(\text{radiusMeters} \times 1.5))\right)$$

If $\text{accuracy} > \text{maxAccuracy}$, the server rejects the request with:
> *"Độ chính xác GPS quá thấp (sai số ±Xm, yêu cầu ≤ ±Ym). Vui lòng di chuyển ra nơi thông thoáng hoặc bật GPS độ chính xác cao."*

---

## 5. GPS Spoofing Vectors & Inherent Browser Limitations

### 5.1 The Inherent Nature of Web Geolocation
In standard web browsers (HTML5 W3C Geolocation), coordinates are provided by the operating system to the browser engine, and exposed via JavaScript `navigator.geolocation`. 

Unlike native mobile applications with hardware security enclaves (Android SafetyNet / Play Integrity, Apple DeviceCheck), a web page running in a browser **cannot** cryptographically verify that the operating system hardware received genuine GNSS satellite radio signals.

### 5.2 Common Spoofing Techniques
1. **Browser DevTools Sensor Emulation**:
   - Developers can open Chrome DevTools > Sensors tab > Location and enter arbitrary latitude/longitude coordinates.
2. **Virtual GPS / Mock Location Applications**:
   - On Android, "Mock Locations" can be enabled in Developer Options, feeding fake NMEA sentences to the OS.
3. **Browser Extensions & Prototype Tampering**:
   - Malicious browser extensions can monkey-patch `navigator.geolocation.getCurrentPosition` to return preset coordinates before the page JavaScript loads.
4. **GPS Radio Frequency Spoofer (SDR - Software Defined Radio)**:
   - Advanced hardware (HackRF, BladeRF) emitting forged satellite signals. (Extreme edge case).

---

## 6. Multi-Layer Server-Side Defense Mechanisms

To mitigate spoofing without compromising legitimate employee experience, Antigravity HRMS enforces a **multi-layer defensive posture**:

### Layer 1: Mandatory Server-Side Distance Verification
All geodesic distances are calculated on the backend from raw coordinates. Modifying the client JavaScript to bypass the UI geofence check has zero effect on the server.

### Layer 2: Accuracy Ceiling & Anomalous Precision Gating
- Spoofing tools often output static, unrealistic accuracy values (e.g. exactly $0.0\text{m}$, or generic fixed values).
- The server validates that accuracy is within realistic physical bounds ($5\text{m} \le \text{accuracy} \le \text{maxAccuracy}$).

### Layer 3: Impossible Travel / Velocity Anomaly Detection
The server inspects the employee's previous attendance event (check-in or check-out) that recorded coordinates:

$$\text{Speed} = \frac{\Delta\text{Distance (km)}}{\Delta\text{Time (hours)}}$$

If $\text{Speed} > 800\text{ km/h}$ (cruising speed of commercial aircraft), the request is flagged as a teleportation anomaly:
- The transaction is blocked with `400 Bad Request`.
- An audit warning log is recorded with full telemetry (`employeeId`, `distanceKm`, `elapsedHours`, `speedKmPerHour`).

### Layer 4: Worksite Association Strictness
Employees can be assigned to specific worksites (`worksiteId`). If assigned, attendance cannot be logged against a different worksite unless explicitly transferred or designated as mobile staff.

### Layer 5: Comprehensive Immutable Audit Trails
Every GPS attendance check logs:
- `workDate`
- `checkInTime` / `checkOutTime`
- `checkInMethod = 'GPS'`
- `checkInLat`, `checkInLng` (stored as exact Decimals)
- `worksiteId` and distance in meters
- `actorId`, User Agent, and timestamp in the `audit_logs` table.

---

## 7. Enterprise Defense-in-Depth Recommendations

For corporate environments requiring high assurance against GPS spoofing, the following complementary controls should be deployed:

1. **Dual-Factor Attendance (GPS + Rotating QR Kiosk)**:
   - Phase 7 introduced Rotating QR Tokens on Lobby Kiosks. Combining Phase 7 (QR) and Phase 8 (GPS) requires the employee to both scan the rotating dynamic QR code displayed on the physical kiosk AND have their device within the worksite geofence.
2. **Internal Wi-Fi / IP Correlation**:
   - Corporate router IP addresses or internal subnet ranges can be cross-checked alongside GPS coordinates.
3. **Native Mobile App with Hardware Attestation**:
   - When migrating to native Android/iOS mobile applications, incorporate Google Play Integrity or Apple App Attest to ensure the device is not rooted, bootloader unlocked, or running mock location providers.

---

## 8. Summary of Geofence Capabilities

| Feature | Support in Phase 8 |
|---|---|
| Browser Geolocation (HTML5) | ✅ Yes |
| Configurable Worksite CRUD | ✅ Yes (Name, Address, Lat, Lng, Radius, Status) |
| Configurable Radius | ✅ Yes (10m to 5,000m) |
| Server-Side Haversine Math | ✅ Yes (`src/lib/utils/geo.ts`) |
| Accuracy Threshold Filtering | ✅ Yes (`validateGpsAccuracy`) |
| Impossible Velocity Detection | ✅ Yes (`detectImpossibleTravel`) |
| Soft-deactivation & Audit Logs | ✅ Yes |
| Geolocation Permission & Timeout UX | ✅ Yes (`GpsAttendanceModal.tsx`) |
| Automated Unit & Integration Tests | ✅ Yes (`gps-attendance.service.test.ts`, `worksite.service.test.ts`) |

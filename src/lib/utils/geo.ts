/**
 * GEODETIC & GEOFENCING UTILITIES
 *
 * Implements server-side spherical trigonometry (Haversine formula),
 * accuracy threshold analysis, and velocity anomaly detection (anti-spoofing).
 */

const EARTH_RADIUS_METERS = 6371000; // Mean radius of Earth in meters

/**
 * Calculate the great-circle distance between two geographic coordinates using the Haversine formula.
 *
 * @param lat1 Latitude of point 1 in decimal degrees
 * @param lon1 Longitude of point 1 in decimal degrees
 * @param lat2 Latitude of point 2 in decimal degrees
 * @param lon2 Longitude of point 2 in decimal degrees
 * @returns Great-circle distance in meters (rounded to 1 decimal place)
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) {
    return 0;
  }

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaPhi = toRadians(lat2 - lat1);
  const deltaLambda = toRadians(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  // Guard against numerical inaccuracy exceeding [-1, 1] bounds
  const clampedA = Math.max(0, Math.min(1, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  const distance = EARTH_RADIUS_METERS * c;
  return Math.round(distance * 10) / 10;
}

/**
 * Check if user coordinates are within a worksite's allowed geofence radius.
 */
export function checkGeofenceProximity(
  userLat: number,
  userLng: number,
  worksiteLat: number,
  worksiteLng: number,
  radiusMeters: number
): {
  distanceMeters: number;
  allowedRadiusMeters: number;
  isWithinRadius: boolean;
  excessMeters: number;
} {
  const distanceMeters = calculateHaversineDistanceMeters(userLat, userLng, worksiteLat, worksiteLng);
  const isWithinRadius = distanceMeters <= radiusMeters;
  const excessMeters = isWithinRadius ? 0 : Math.round((distanceMeters - radiusMeters) * 10) / 10;

  return {
    distanceMeters,
    allowedRadiusMeters: radiusMeters,
    isWithinRadius,
    excessMeters,
  };
}

/**
 * Validate GPS fix accuracy against strict enterprise thresholds.
 *
 * Accuracy represents the radius of 95% confidence in meters.
 * If accuracy is wider than the allowed radius or wider than 150m,
 * the employee's true position could easily be hundreds of meters away outside the worksite.
 */
export function validateGpsAccuracy(
  accuracyMeters: number,
  worksiteRadiusMeters: number,
  hardMaxThreshold = 150
): {
  isValid: boolean;
  maxAllowedAccuracy: number;
  reason?: string;
} {
  // Max permissible error is the smaller of hardMaxThreshold or 1.5x the geofence radius (minimum 50m)
  const maxAllowedAccuracy = Math.min(
    hardMaxThreshold,
    Math.max(50, Math.round(worksiteRadiusMeters * 1.5))
  );

  if (accuracyMeters < 0) {
    return {
      isValid: false,
      maxAllowedAccuracy,
      reason: 'Độ chính xác vị trí không hợp lệ (nhỏ hơn 0m).',
    };
  }

  if (accuracyMeters > maxAllowedAccuracy) {
    return {
      isValid: false,
      maxAllowedAccuracy,
      reason: `Độ chính xác GPS quá thấp (sai số ±${Math.round(accuracyMeters)}m, yêu cầu ≤ ±${maxAllowedAccuracy}m). Vui lòng di chuyển ra nơi thông thoáng hoặc bật GPS độ chính xác cao.`,
    };
  }

  return {
    isValid: true,
    maxAllowedAccuracy,
  };
}

/**
 * Detect impossible travel / velocity anomaly between two consecutive attendance actions.
 *
 * If an employee records attendance at Location A and then Location B in a timeframe
 * that requires traveling faster than 800 km/h (typical commercial jet cruising speed),
 * it strongly indicates GPS coordinate spoofing or account sharing.
 */
export function detectImpossibleTravel(
  lat1: number,
  lon1: number,
  time1: Date,
  lat2: number,
  lon2: number,
  time2: Date,
  maxSpeedKmPerHour = 800
): {
  isImpossible: boolean;
  speedKmPerHour: number;
  distanceKm: number;
  elapsedHours: number;
} {
  const timeDiffMs = Math.abs(time2.getTime() - time1.getTime());
  const elapsedHours = timeDiffMs / (1000 * 60 * 60);

  const distanceMeters = calculateHaversineDistanceMeters(lat1, lon1, lat2, lon2);
  const distanceKm = distanceMeters / 1000;

  if (elapsedHours <= 0) {
    // Simultaneous actions at different locations
    const isImpossible = distanceMeters > 500; // > 500m instantaneously
    return {
      isImpossible,
      speedKmPerHour: isImpossible ? Infinity : 0,
      distanceKm,
      elapsedHours: 0,
    };
  }

  const speedKmPerHour = Math.round((distanceKm / elapsedHours) * 10) / 10;
  const isImpossible = speedKmPerHour > maxSpeedKmPerHour;

  return {
    isImpossible,
    speedKmPerHour,
    distanceKm: Math.round(distanceKm * 10) / 10,
    elapsedHours: Math.round(elapsedHours * 100) / 100,
  };
}

// swim_data_analyser/static/js/units.js

export const UNIT_FACTORS = {
    METERS_TO_YARDS: 1 / 0.9144,
    YARDS_TO_METERS: 0.9144,
};

/**
 * Checks if the session uses yards (statute) or meters (metric).
 * @param {Object} session - The session message object from the FIT file.
 * @returns {boolean} True if units are yards, false if meters.
 */
export function isYards(session) {
    return session?.poolLengthUnit === 'statute';
}

/**
 * Gets the display label for the distance unit.
 * @param {Object} session - The session message object.
 * @returns {string} 'yd' or 'm'.
 */
export function getUnitLabel(session) {
    return isYards(session) ? 'yd' : 'm';
}

/**
 * Converts a distance in meters to the appropriate display value (m or yd).
 * @param {number} meters - The distance in meters.
 * @param {Object} session - The session message object.
 * @returns {number} The converted value.
 */
export function toDisplayDistance(meters, session) {
    if (meters == null) return 0;
    return isYards(session) ? meters * UNIT_FACTORS.METERS_TO_YARDS : meters;
}

/**
 * Converts a user-provided display distance (m or yd) back into meters.
 * @param {number} value - The display value.
 * @param {Object} session - The session message object.
 * @returns {number} The distance in meters.
 */
export function toInternalDistance(value, session) {
    if (value == null) return 0;
    return isYards(session) ? value * UNIT_FACTORS.YARDS_TO_METERS : value;
}

/**
 * Calculates the pace in seconds per 100 distance units (m or yd).
 * @param {number} speedMps - Speed in meters per second.
 * @param {Object} session - The session message object.
 * @returns {number} Pace in seconds per 100 units.
 */
export function getPaceSeconds(speedMps, session) {
    if (!speedMps || speedMps <= 0) return 0;
    // Pace is time per 100 units.
    // If unit is yards, 100yd = 91.44m.
    // Time to cover distance D with speed S is D/S.
    const distanceToCover = isYards(session) ? 91.44 : 100;
    return distanceToCover / speedMps;
}

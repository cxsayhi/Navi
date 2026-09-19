package com.wanderline.navigation;

public record NavigationStepResponse(
        TravelMode travelMode,
        String instruction,
        int distanceMeters,
        long durationSeconds,
        String distanceText,
        String durationText,
        String transitLine,
        String transitHeadsign,
        String departureStop,
        String arrivalStop,
        String departureTime,
        String arrivalTime,
        Integer stopCount
) {
}

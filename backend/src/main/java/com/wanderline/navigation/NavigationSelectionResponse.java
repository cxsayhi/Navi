package com.wanderline.navigation;

import java.time.Instant;

public record NavigationSelectionResponse(
        Long id,
        Long dailyRouteId,
        Long originPointId,
        Long destinationPointId,
        TravelMode travelMode,
        String departureTime,
        String status,
        Instant savedAt
) {
}

package com.wanderline.navigation;

import java.time.Instant;
import java.util.List;

public record NavigationRouteOptionsResponse(
        TravelMode travelMode,
        List<NavigationRouteResponse> options,
        boolean cached,
        boolean stale,
        Instant generatedAt,
        Instant expiresAt
) {
}

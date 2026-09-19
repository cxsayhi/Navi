package com.wanderline.trip;

import java.time.Instant;

public record RoutePointResponse(
        Long id,
        String googlePlaceId,
        String customName,
        String note,
        String arrivalTime,
        String departureTime,
        int position,
        Instant createdAt,
        Instant updatedAt
) {
}

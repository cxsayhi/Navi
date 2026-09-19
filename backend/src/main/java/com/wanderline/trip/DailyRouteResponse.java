package com.wanderline.trip;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record DailyRouteResponse(
        Long id,
        int dayNumber,
        LocalDate routeDate,
        String title,
        String notes,
        String routeColor,
        List<RoutePointResponse> routePoints,
        Instant createdAt,
        Instant updatedAt
) {
}

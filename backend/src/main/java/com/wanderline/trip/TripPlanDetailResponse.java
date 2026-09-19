package com.wanderline.trip;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record TripPlanDetailResponse(
        Long id,
        String title,
        String destination,
        String timezone,
        LocalDate startDate,
        LocalDate endDate,
        String notes,
        int dayCount,
        List<DailyRouteResponse> dailyRoutes,
        Instant createdAt,
        Instant updatedAt
) {
}

package com.wanderline.trip;

import java.time.Instant;
import java.time.LocalDate;

public record TripPlanSummaryResponse(
        Long id,
        String title,
        String destination,
        String timezone,
        LocalDate startDate,
        LocalDate endDate,
        int dayCount,
        int plannedDayCount,
        Instant createdAt,
        Instant updatedAt
) {
}

package com.wanderline.trip;

public record DeleteTripPlanResponse(
        Long id,
        boolean deleted
) {
}

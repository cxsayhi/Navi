package com.wanderline.navigation;
import jakarta.validation.constraints.*;
import java.time.OffsetDateTime;
public record NavigationRouteRequest(
    @NotBlank @Size(max=255) String originPlaceId,
    @NotBlank @Size(max=255) String destinationPlaceId,
    @NotNull TravelMode travelMode,
    OffsetDateTime departureTime,
    @Positive Long dailyRouteId,
    @Positive Long originPointId,
    @Positive Long destinationPointId,
    @Pattern(regexp="^([01][0-9]|2[0-3]):[0-5][0-9]$") String plannedDepartureTime
) {
    public NavigationRouteRequest(String origin, String destination, TravelMode mode, OffsetDateTime departure) {
        this(origin, destination, mode, departure, null, null, null, null);
    }
}

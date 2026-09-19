package com.wanderline.trip;
import jakarta.validation.constraints.*;
public record RoutePointRequest(
    @NotBlank @Size(max=255) String googlePlaceId,
    @Size(max=200) String customName,
    @Size(max=2000) String note,
    @Pattern(regexp="^([01][0-9]|2[0-3]):[0-5][0-9]$") String arrivalTime,
    @Pattern(regexp="^([01][0-9]|2[0-3]):[0-5][0-9]$") String departureTime
) {}

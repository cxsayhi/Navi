package com.wanderline.navigation;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record SaveNavigationSelectionRequest(
        @NotNull(message = "缺少每日路线")
        @Positive(message = "每日路线标识必须为正数")
        Long dailyRouteId,

        @NotNull(message = "缺少出发 Pin")
        @Positive(message = "出发 Pin 标识必须为正数")
        Long originPointId,

        @NotNull(message = "缺少到达 Pin")
        @Positive(message = "到达 Pin 标识必须为正数")
        Long destinationPointId,

        @NotNull TravelMode travelMode,
        @jakarta.validation.constraints.Pattern(regexp="^([01][0-9]|2[0-3]):[0-5][0-9]$") String departureTime
) {
}

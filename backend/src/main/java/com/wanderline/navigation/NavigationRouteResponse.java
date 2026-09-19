package com.wanderline.navigation;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record NavigationRouteResponse(
        @NotBlank(message = "缺少路线方案标识")
        String optionId,

        boolean recommended,

        @NotNull(message = "缺少交通方式")
        TravelMode travelMode,

        @Min(value = 0, message = "路线距离不能为负数")
        int distanceMeters,

        @Min(value = 0, message = "路线时间不能为负数")
        long durationSeconds,

        @NotBlank(message = "缺少路线距离说明")
        String distanceText,

        @NotBlank(message = "缺少路线时间说明")
        String durationText,

        @NotBlank(message = "缺少路线折线")
        String encodedPolyline,

        @NotNull(message = "缺少路线步骤")
        List<@Valid NavigationStepResponse> steps,

        @NotNull(message = "缺少路线提示")
        List<String> warnings
) {

}

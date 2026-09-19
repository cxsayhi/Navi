package com.wanderline.trip;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public record DailyRouteRequest(
        @NotNull(message = "请选择路线日期")
        LocalDate routeDate,

        @Size(max = 120, message = "路线标题不能超过 120 个字符")
        String title,

        @Size(max = 2000, message = "路线备注不能超过 2000 个字符")
        String notes,

        @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "路线颜色必须是十六进制颜色")
        String routeColor
) {
}

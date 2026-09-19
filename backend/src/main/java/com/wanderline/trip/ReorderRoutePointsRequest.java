package com.wanderline.trip;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ReorderRoutePointsRequest(
        @NotEmpty(message = "地点顺序不能为空")
        @Size(max = 30, message = "每日路线最多支持 30 个地点")
        List<@Positive(message = "地点 ID 必须为正数") Long> routePointIds
) {
}

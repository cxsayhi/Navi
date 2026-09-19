package com.wanderline.trip;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public record TripPlanRequest(
        @NotBlank(message = "请输入计划名称")
        @Size(max = 120, message = "计划名称不能超过 120 个字符")
        String title,

        @NotBlank(message = "请输入目的地")
        @Size(max = 120, message = "目的地不能超过 120 个字符")
        String destination,
        String timezone,

        @NotNull(message = "请选择开始日期")
        LocalDate startDate,

        @NotNull(message = "请选择结束日期")
        LocalDate endDate,

        @Size(max = 2000, message = "计划备注不能超过 2000 个字符")
        String notes
) {
    public TripPlanRequest(String title, String destination, LocalDate startDate, LocalDate endDate, String notes) {
        this(title, destination, "UTC", startDate, endDate, notes);
    }
}

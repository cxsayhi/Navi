package com.wanderline.trip;

import com.wanderline.common.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Validated
@RestController
@RequestMapping({"/api/trip-plans", "/api/trips"})
public class TripPlanController {

    private final TripPlanService service;

    public TripPlanController(TripPlanService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResponse<List<TripPlanSummaryResponse>> listPlans() {
        return ApiResponse.success(service.listPlans());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<TripPlanDetailResponse> createPlan(@Valid @RequestBody TripPlanRequest request) {
        return ApiResponse.success(service.createPlan(request));
    }

    @GetMapping("/{planId}")
    public ApiResponse<TripPlanDetailResponse> getPlan(@Positive @PathVariable Long planId) {
        return ApiResponse.success(service.getPlan(planId));
    }

    @PutMapping("/{planId}")
    public ApiResponse<TripPlanDetailResponse> updatePlan(
            @Positive @PathVariable Long planId,
            @Valid @RequestBody TripPlanRequest request
    ) {
        return ApiResponse.success(service.updatePlan(planId, request));
    }

    @org.springframework.web.bind.annotation.PatchMapping("/{planId}")
    public ApiResponse<TripPlanDetailResponse> patchPlan(
            @Positive @PathVariable Long planId,
            @RequestBody java.util.Map<String, String> changes
    ) {
        return ApiResponse.success(service.patchPlan(planId, changes));
    }

    @DeleteMapping("/{planId}")
    public ApiResponse<DeleteTripPlanResponse> deletePlan(@Positive @PathVariable Long planId) {
        return ApiResponse.success(service.deletePlan(planId));
    }

    @PostMapping("/{planId}/daily-routes")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<TripPlanDetailResponse> createDailyRoute(
            @Positive @PathVariable Long planId,
            @Valid @RequestBody DailyRouteRequest request
    ) {
        return ApiResponse.success(service.createDailyRoute(planId, request));
    }

    @PostMapping("/{planId}/daily-routes/generate")
    public ApiResponse<TripPlanDetailResponse> generateDailyRoutes(@Positive @PathVariable Long planId) {
        return ApiResponse.success(service.generateDailyRoutes(planId));
    }

    @PutMapping("/{planId}/daily-routes/{dailyRouteId}")
    public ApiResponse<TripPlanDetailResponse> updateDailyRoute(
            @Positive @PathVariable Long planId,
            @Positive @PathVariable Long dailyRouteId,
            @Valid @RequestBody DailyRouteRequest request
    ) {
        return ApiResponse.success(service.updateDailyRoute(planId, dailyRouteId, request));
    }

    @DeleteMapping("/{planId}/daily-routes/{dailyRouteId}")
    public ApiResponse<TripPlanDetailResponse> deleteDailyRoute(
            @Positive @PathVariable Long planId,
            @Positive @PathVariable Long dailyRouteId
    ) {
        return ApiResponse.success(service.deleteDailyRoute(planId, dailyRouteId));
    }

    @PostMapping({"/{planId}/daily-routes/{dailyRouteId}/route-points", "/{planId}/days/{dailyRouteId}/stops"})
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<TripPlanDetailResponse> addRoutePoint(
            @Positive @PathVariable Long planId,
            @Positive @PathVariable Long dailyRouteId,
            @Valid @RequestBody RoutePointRequest request
    ) {
        return ApiResponse.success(service.addRoutePoint(planId, dailyRouteId, request));
    }

    @PutMapping({"/{planId}/daily-routes/{dailyRouteId}/route-points/reorder", "/{planId}/days/{dailyRouteId}/stops/order"})
    public ApiResponse<TripPlanDetailResponse> reorderRoutePoints(
            @Positive @PathVariable Long planId,
            @Positive @PathVariable Long dailyRouteId,
            @Valid @RequestBody ReorderRoutePointsRequest request
    ) {
        return ApiResponse.success(service.reorderRoutePoints(planId, dailyRouteId, request));
    }

    @DeleteMapping("/{planId}/daily-routes/{dailyRouteId}/route-points/{routePointId}")
    public ApiResponse<TripPlanDetailResponse> deleteRoutePoint(
            @Positive @PathVariable Long planId,
            @Positive @PathVariable Long dailyRouteId,
            @Positive @PathVariable Long routePointId
    ) {
        return ApiResponse.success(service.deleteRoutePoint(planId, dailyRouteId, routePointId));
    }
}

package com.wanderline.navigation;

import com.wanderline.common.api.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.validation.annotation.Validated;

@Validated
@RestController
@RequestMapping("/api/navigation")
public class NavigationController {

    private final NavigationService service;
    private final NavigationSelectionService selectionService;

    public NavigationController(NavigationService service, NavigationSelectionService selectionService) {
        this.service = service;
        this.selectionService = selectionService;
    }

    @PostMapping("/routes")
    public ApiResponse<NavigationRouteResponse> computeRoute(
            @Valid @RequestBody NavigationRouteRequest request
    ) {
        return ApiResponse.success(service.computeRoute(request));
    }

    @PostMapping("/route-options")
    public ApiResponse<NavigationRouteOptionsResponse> computeRouteOptions(
            @Valid @RequestBody NavigationRouteRequest request
    ) {
        return ApiResponse.success(service.computeRouteOptions(request));
    }

    @GetMapping("/selections")
    public ApiResponse<NavigationSelectionStateResponse> getSelection(
            @Positive @RequestParam Long dailyRouteId,
            @Positive @RequestParam Long originPointId,
            @Positive @RequestParam Long destinationPointId
    ) {
        return ApiResponse.success(selectionService.getSelection(
                dailyRouteId,
                originPointId,
                destinationPointId
        ));
    }

    @GetMapping("/selections/trip-plan/{tripPlanId}")
    public ApiResponse<TripPlanNavigationSelectionsResponse> getSelectionsForTripPlan(
            @Positive @PathVariable Long tripPlanId
    ) {
        return ApiResponse.success(selectionService.getSelectionsForTripPlan(tripPlanId));
    }

    @PutMapping("/selections")
    public ApiResponse<NavigationSelectionResponse> saveSelection(
            @Valid @RequestBody SaveNavigationSelectionRequest request
    ) {
        return ApiResponse.success(selectionService.saveSelection(request));
    }
}

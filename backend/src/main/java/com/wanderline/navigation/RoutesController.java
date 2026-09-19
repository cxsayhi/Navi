package com.wanderline.navigation;
import com.wanderline.common.api.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/routes")
public class RoutesController {
    private final NavigationService service;
    public RoutesController(NavigationService service) { this.service = service; }
    @PostMapping("/compute")
    public ApiResponse<NavigationRouteOptionsResponse> compute(@Valid @RequestBody NavigationRouteRequest request) {
        return ApiResponse.success(service.computeRouteOptions(request));
    }
}

package com.wanderline.trip;
import com.wanderline.common.api.ApiResponse;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
@RestController
@RequestMapping("/api/stops")
public class StopController {
    private final TripPlanService service;
    public StopController(TripPlanService service) { this.service = service; }
    @PatchMapping("/{id}")
    public ApiResponse<TripPlanDetailResponse> update(@PathVariable Long id, @RequestBody Map<String, String> changes) {
        return ApiResponse.success(service.updateStop(id, changes));
    }
    @DeleteMapping("/{id}")
    public ApiResponse<TripPlanDetailResponse> delete(@PathVariable Long id) {
        return ApiResponse.success(service.deleteStop(id));
    }
}

package com.wanderline.system;

import com.wanderline.common.api.ApiResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/system")
public class SystemController {

    private final String serviceName;

    public SystemController(@Value("${spring.application.name}") String serviceName) {
        this.serviceName = serviceName;
    }

    @GetMapping("/info")
    public ApiResponse<SystemInfoResponse> info() {
        return ApiResponse.success(new SystemInfoResponse(
                serviceName,
                "READY",
                "GOOGLE_MAPS",
                "0.8.0"
        ));
    }
}

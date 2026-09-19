package com.wanderline.system;

public record SystemInfoResponse(
        String service,
        String status,
        String mapProvider,
        String version
) {
}

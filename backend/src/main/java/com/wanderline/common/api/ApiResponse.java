package com.wanderline.common.api;

import com.wanderline.config.RequestIdFilter;
import org.slf4j.MDC;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record ApiResponse<T>(
        boolean success,
        T data,
        ApiError error,
        Instant timestamp,
        String requestId
) {

    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(true, data, null, Instant.now(), currentRequestId());
    }

    public static <T> ApiResponse<T> failure(String code, String message) {
        return failure(code, message, Map.of());
    }

    public static <T> ApiResponse<T> failure(String code, String message, Map<String, String> details) {
        ApiError error = new ApiError(code, message, Map.copyOf(details));
        return new ApiResponse<>(false, null, error, Instant.now(), currentRequestId());
    }

    private static String currentRequestId() {
        String requestId = MDC.get(RequestIdFilter.REQUEST_ID_MDC_KEY);
        return requestId == null ? UUID.randomUUID().toString() : requestId;
    }
}

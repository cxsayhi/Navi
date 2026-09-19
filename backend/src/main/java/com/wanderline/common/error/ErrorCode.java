package com.wanderline.common.error;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
    BAD_REQUEST(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "请求内容不正确"),
    VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "请求参数校验失败"),
    NOT_FOUND(HttpStatus.NOT_FOUND, "NOT_FOUND", "请求的资源不存在"),
    CONFLICT(HttpStatus.CONFLICT, "CONFLICT", "当前操作与资源状态冲突"),
    MAP_CONFIGURATION_REQUIRED(HttpStatus.SERVICE_UNAVAILABLE, "MAP_CONFIGURATION_REQUIRED", "地图路线服务尚未配置"),
    MAP_ROUTE_NOT_FOUND(HttpStatus.NOT_FOUND, "MAP_ROUTE_NOT_FOUND", "没有找到可用路线"),
    MAP_TIMEOUT(HttpStatus.GATEWAY_TIMEOUT, "MAP_TIMEOUT", "地图服务响应超时"),
    MAP_RATE_LIMITED(HttpStatus.SERVICE_UNAVAILABLE, "MAP_RATE_LIMITED", "路线请求较多，请稍后重试"),
    MAP_PROVIDER_ERROR(HttpStatus.BAD_GATEWAY, "MAP_PROVIDER_ERROR", "地图服务暂时不可用"),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务暂时不可用");

    private final HttpStatus httpStatus;
    private final String code;
    private final String defaultMessage;

    ErrorCode(HttpStatus httpStatus, String code, String defaultMessage) {
        this.httpStatus = httpStatus;
        this.code = code;
        this.defaultMessage = defaultMessage;
    }

    public HttpStatus httpStatus() {
        return httpStatus;
    }

    public String code() {
        return code;
    }

    public String defaultMessage() {
        return defaultMessage;
    }
}

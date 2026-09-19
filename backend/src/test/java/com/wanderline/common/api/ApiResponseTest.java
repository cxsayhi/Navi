package com.wanderline.common.api;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ApiResponseTest {

    @Test
    void createsSuccessfulEnvelope() {
        ApiResponse<String> response = ApiResponse.success("ready");

        assertThat(response.success()).isTrue();
        assertThat(response.data()).isEqualTo("ready");
        assertThat(response.error()).isNull();
        assertThat(response.timestamp()).isNotNull();
        assertThat(response.requestId()).isNotBlank();
    }

    @Test
    void createsFailureEnvelope() {
        ApiResponse<Void> response = ApiResponse.failure("NOT_FOUND", "资源不存在");

        assertThat(response.success()).isFalse();
        assertThat(response.data()).isNull();
        assertThat(response.error()).isNotNull();
        assertThat(response.error().code()).isEqualTo("NOT_FOUND");
    }
}

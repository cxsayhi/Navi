package com.wanderline.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.List;

@ConfigurationProperties(prefix = "app")
public record ApplicationProperties(
        Cors cors,
        GoogleMaps googleMaps
) {

    public record Cors(List<String> allowedOrigins) {
    }

    public record GoogleMaps(String serverApiKey, Duration requestTimeout) {
    }

}

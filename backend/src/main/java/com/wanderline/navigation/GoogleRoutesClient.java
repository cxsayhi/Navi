package com.wanderline.navigation;

import com.wanderline.common.error.ApiException;
import com.wanderline.common.error.ErrorCode;
import com.wanderline.config.ApplicationProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.ResourceAccessException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Component
class GoogleRoutesClient implements GoogleRoutesGateway {

    private static final Logger log = LoggerFactory.getLogger(GoogleRoutesClient.class);
    private static final String FIELD_MASK = String.join(",",
            "routes.distanceMeters",
            "routes.duration",
            "routes.polyline.encodedPolyline",
            "routes.localizedValues.distance",
            "routes.localizedValues.duration",
            "routes.routeLabels",
            "routes.warnings",
            "routes.legs.steps.distanceMeters",
            "routes.legs.steps.staticDuration",
            "routes.legs.steps.navigationInstruction.instructions",
            "routes.legs.steps.travelMode",
            "routes.legs.steps.localizedValues.distance",
            "routes.legs.steps.localizedValues.staticDuration",
            "routes.legs.steps.transitDetails"
    );

    private final RestClient restClient;
    private final String apiKey;

    @Autowired
    GoogleRoutesClient(ApplicationProperties properties) {
        this(configuredBuilder(properties), properties);
    }

    GoogleRoutesClient(RestClient.Builder builder, ApplicationProperties properties) {
        this.restClient = builder.baseUrl("https://routes.googleapis.com").build();
        this.apiKey = properties.googleMaps().serverApiKey();
    }

    @Override
    public List<NavigationRouteResponse> computeRoutes(NavigationRouteRequest request) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new ApiException(
                    ErrorCode.MAP_CONFIGURATION_REQUIRED,
                    "尚未配置 GOOGLE_MAPS_SERVER_API_KEY，请为后端配置仅允许 Routes API 的服务端密钥"
            );
        }

        Map<String, Object> body = createRequestBody(request);
        try {
            GoogleRoutesResponse response = restClient.post()
                    .uri("/directions/v2:computeRoutes")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("X-Goog-Api-Key", apiKey)
                    .header("X-Goog-FieldMask", FIELD_MASK)
                    .body(body)
                    .retrieve()
                    .body(GoogleRoutesResponse.class);

            if (response == null || response.routes() == null || response.routes().isEmpty()) {
                throw new ApiException(
                        ErrorCode.MAP_ROUTE_NOT_FOUND,
                        request.travelMode() == TravelMode.TRANSIT
                                ? "当前时间没有可用的公共交通方案"
                                : "这两个地点之间没有找到可用路线"
                );
            }
            List<NavigationRouteResponse> routes = new ArrayList<>();
            for (int index = 0; index < response.routes().size(); index++) {
                routes.add(mapRoute(response.routes().get(index), request.travelMode()));
            }
            return List.copyOf(routes);
        } catch (ApiException exception) {
            throw exception;
        } catch (RestClientResponseException exception) {
            log.warn("Google Routes API returned status {}", exception.getStatusCode().value());
            String responseBody = exception.getResponseBodyAsString();
            if (exception.getStatusCode().value() == 429
                    || responseBody.contains("RESOURCE_EXHAUSTED")
                    || responseBody.contains("OVER_QUERY_LIMIT")) {
                throw new ApiException(
                        ErrorCode.MAP_RATE_LIMITED,
                        "Google Routes API 请求频率或项目额度已达上限，请稍后重试或检查配额"
                );
            }
            if (exception.getStatusCode().value() == 408 || exception.getStatusCode().value() == 504) {
                throw new ApiException(ErrorCode.MAP_TIMEOUT, "Google 路线服务响应超时，请稍后重试");
            }
            throw new ApiException(
                    ErrorCode.MAP_PROVIDER_ERROR,
                    "Google Routes API 请求失败，请检查 Routes API、结算账号和服务端密钥限制"
            );
        } catch (ResourceAccessException exception) {
            log.warn("Google Routes API timed out: {}", exception.getClass().getSimpleName());
            throw new ApiException(ErrorCode.MAP_TIMEOUT, "Google 路线服务连接超时，请稍后重试");
        } catch (RestClientException exception) {
            log.warn("Google Routes API request failed: {}", exception.getClass().getSimpleName());
            throw new ApiException(ErrorCode.MAP_PROVIDER_ERROR, "Google 路线服务暂时不可用，请稍后重试");
        }
    }

    private static RestClient.Builder configuredBuilder(ApplicationProperties properties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(properties.googleMaps().requestTimeout());
        requestFactory.setReadTimeout(properties.googleMaps().requestTimeout());
        return RestClient.builder().requestFactory(requestFactory);
    }

    private Map<String, Object> createRequestBody(NavigationRouteRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("origin", Map.of("placeId", request.originPlaceId()));
        body.put("destination", Map.of("placeId", request.destinationPlaceId()));
        body.put("travelMode", request.travelMode().name());
        body.put("computeAlternativeRoutes", true);
        body.put("languageCode", "zh-CN");
        body.put("units", "METRIC");
        if (request.travelMode() == TravelMode.DRIVE) {
            body.put("routingPreference", request.departureTime() == null ? "TRAFFIC_UNAWARE" : "TRAFFIC_AWARE");
        }
        if (request.travelMode() != TravelMode.WALK && request.departureTime() != null)
            body.put("departureTime", request.departureTime().toInstant().toString());
        return body;
    }

    private NavigationRouteResponse mapRoute(GoogleRoute route, TravelMode requestedMode) {
        List<NavigationStepResponse> steps = new ArrayList<>();
        if (route.legs() != null) {
            route.legs().stream()
                    .filter(leg -> leg.steps() != null)
                    .flatMap(leg -> leg.steps().stream())
                    .map(step -> mapStep(step, requestedMode))
                    .forEach(steps::add);
        }

        return new NavigationRouteResponse(
                optionId(requestedMode, route),
                route.routeLabels() != null && route.routeLabels().contains("DEFAULT_ROUTE"),
                requestedMode,
                valueOrZero(route.distanceMeters()),
                durationSeconds(route.duration()),
                localized(route.localizedValues() == null ? null : route.localizedValues().distance(),
                        formatDistance(valueOrZero(route.distanceMeters()))),
                localized(route.localizedValues() == null ? null : route.localizedValues().duration(),
                        formatDuration(durationSeconds(route.duration()))),
                route.polyline() == null ? "" : valueOrEmpty(route.polyline().encodedPolyline()),
                List.copyOf(steps),
                route.warnings() == null ? List.of() : List.copyOf(route.warnings())
        );
    }

    private String optionId(TravelMode mode, GoogleRoute route) {
        String fingerprint = mode.name()
                + '|' + valueOrEmpty(route.polyline() == null ? null : route.polyline().encodedPolyline());
        return mode.name().toLowerCase(Locale.ROOT) + '-'
                + UUID.nameUUIDFromBytes(fingerprint.getBytes(StandardCharsets.UTF_8));
    }

    private NavigationStepResponse mapStep(GoogleStep step, TravelMode requestedMode) {
        TravelMode stepMode = parseMode(step.travelMode(), requestedMode);
        GoogleTransitDetails transit = step.transitDetails();
        GoogleStopDetails stopDetails = transit == null ? null : transit.stopDetails();
        GoogleTransitLine transitLine = transit == null ? null : transit.transitLine();
        String lineName = transitLine == null
                ? null
                : firstNonBlank(transitLine.nameShort(), transitLine.name());

        String instruction = step.navigationInstruction() == null
                ? null
                : step.navigationInstruction().instructions();
        if ((instruction == null || instruction.isBlank()) && lineName != null) {
            instruction = "乘坐 " + lineName
                    + (transit.headsign() == null || transit.headsign().isBlank()
                    ? ""
                    : "，开往 " + transit.headsign());
        }
        if (instruction == null || instruction.isBlank()) {
            instruction = switch (stepMode) {
                case WALK -> "步行前往下一站";
                case DRIVE -> "继续驾车";
                case TRANSIT -> "乘坐公共交通";
            };
        }

        int distanceMeters = valueOrZero(step.distanceMeters());
        long durationSeconds = durationSeconds(step.staticDuration());
        return new NavigationStepResponse(
                stepMode,
                instruction,
                distanceMeters,
                durationSeconds,
                localized(step.localizedValues() == null ? null : step.localizedValues().distance(),
                        formatDistance(distanceMeters)),
                localized(step.localizedValues() == null ? null : step.localizedValues().staticDuration(),
                        formatDuration(durationSeconds)),
                lineName,
                transit == null ? null : transit.headsign(),
                stopName(stopDetails == null ? null : stopDetails.departureStop()),
                stopName(stopDetails == null ? null : stopDetails.arrivalStop()),
                stopDetails == null ? null : stopDetails.departureTime(),
                stopDetails == null ? null : stopDetails.arrivalTime(),
                transit == null ? null : transit.stopCount()
        );
    }

    private TravelMode parseMode(String value, TravelMode fallback) {
        if (value == null) return fallback;
        try {
            return TravelMode.valueOf(value);
        } catch (IllegalArgumentException exception) {
            return fallback;
        }
    }

    private long durationSeconds(String duration) {
        if (duration == null || duration.isBlank() || !duration.endsWith("s")) return 0;
        try {
            return new BigDecimal(duration.substring(0, duration.length() - 1))
                    .setScale(0, RoundingMode.HALF_UP)
                    .longValue();
        } catch (NumberFormatException exception) {
            return 0;
        }
    }

    private String formatDistance(int meters) {
        if (meters >= 1000) {
            return BigDecimal.valueOf(meters / 1000.0)
                    .setScale(1, RoundingMode.HALF_UP)
                    .stripTrailingZeros()
                    .toPlainString() + " 公里";
        }
        return meters + " 米";
    }

    private String formatDuration(long seconds) {
        long minutes = Math.max(1, Math.round(seconds / 60.0));
        if (minutes >= 60) {
            long hours = minutes / 60;
            long remainingMinutes = minutes % 60;
            return remainingMinutes == 0
                    ? hours + " 小时"
                    : hours + " 小时 " + remainingMinutes + " 分钟";
        }
        return minutes + " 分钟";
    }

    private String localized(GoogleLocalizedText text, String fallback) {
        return text == null || text.text() == null || text.text().isBlank() ? fallback : text.text();
    }

    private String stopName(GoogleTransitStop stop) {
        return stop == null ? null : stop.name();
    }

    private int valueOrZero(Integer value) {
        return value == null ? 0 : value;
    }

    private String valueOrEmpty(String value) {
        return value == null ? "" : value;
    }

    private String firstNonBlank(String first, String second) {
        if (first != null && !first.isBlank()) return first;
        if (second != null && !second.isBlank()) return second;
        return null;
    }

    private record GoogleRoutesResponse(List<GoogleRoute> routes) {
    }

    private record GoogleRoute(
            Integer distanceMeters,
            String duration,
            GooglePolyline polyline,
            GoogleRouteLocalizedValues localizedValues,
            List<GoogleLeg> legs,
            List<String> routeLabels,
            List<String> warnings
    ) {
    }

    private record GooglePolyline(String encodedPolyline) {
    }

    private record GoogleRouteLocalizedValues(
            GoogleLocalizedText distance,
            GoogleLocalizedText duration
    ) {
    }

    private record GoogleLeg(List<GoogleStep> steps) {
    }

    private record GoogleStep(
            Integer distanceMeters,
            String staticDuration,
            GoogleNavigationInstruction navigationInstruction,
            String travelMode,
            GoogleStepLocalizedValues localizedValues,
            GoogleTransitDetails transitDetails
    ) {
    }

    private record GoogleNavigationInstruction(String instructions) {
    }

    private record GoogleStepLocalizedValues(
            GoogleLocalizedText distance,
            GoogleLocalizedText staticDuration
    ) {
    }

    private record GoogleLocalizedText(String text, String languageCode) {
    }

    private record GoogleTransitDetails(
            GoogleStopDetails stopDetails,
            String headsign,
            GoogleTransitLine transitLine,
            Integer stopCount
    ) {
    }

    private record GoogleStopDetails(
            GoogleTransitStop arrivalStop,
            String arrivalTime,
            GoogleTransitStop departureStop,
            String departureTime
    ) {
    }

    private record GoogleTransitStop(String name) {
    }

    private record GoogleTransitLine(String name, String nameShort) {
    }
}

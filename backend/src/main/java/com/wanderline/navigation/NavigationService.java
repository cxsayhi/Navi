package com.wanderline.navigation;
import com.wanderline.common.error.*;
import com.wanderline.trip.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class NavigationService {
    private static final DateTimeFormatter TRANSIT_REFERENCE_FORMAT =
            DateTimeFormatter.ofPattern("yyyy年M月d日 E HH:mm", Locale.SIMPLIFIED_CHINESE);
    private final GoogleRoutesGateway routesGateway;
    private final DailyRouteRepository days;
    private final RoutePointRepository points;
    private final NavigationSelectionRepository selections;
    public NavigationService(GoogleRoutesGateway routesGateway, DailyRouteRepository days,
            RoutePointRepository points, NavigationSelectionRepository selections) {
        this.routesGateway = routesGateway;
        this.days = days;
        this.points = points;
        this.selections = selections;
    }
    public NavigationRouteResponse computeRoute(NavigationRouteRequest request) {
        return computeRouteOptions(request).options().get(0);
    }
    @Transactional(readOnly=true)
    public NavigationRouteOptionsResponse computeRouteOptions(NavigationRouteRequest request) {
        if (request.originPlaceId().equals(request.destinationPlaceId()))
            throw new ApiException(ErrorCode.BAD_REQUEST, "出发地点和到达地点不能相同");
        OffsetDateTime departure = resolveDeparture(request);
        Instant now = Instant.now();
        boolean referenceTransit = false;
        if (request.travelMode() == TravelMode.TRANSIT
                && departure.toInstant().isAfter(now.plus(Duration.ofDays(100))))
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "公交出发时间须在过去 7 天至未来 100 天内，请调整计划时间");
        if (request.travelMode() == TravelMode.TRANSIT
                && departure.toInstant().isBefore(now.minus(Duration.ofDays(7)))) {
            long elapsedWeeks = Duration.between(departure.toInstant(), now).getSeconds()
                    / Duration.ofDays(7).toSeconds();
            departure = departure.plusWeeks(elapsedWeeks + 1);
            referenceTransit = true;
        }
        if (request.travelMode() == TravelMode.DRIVE && departure.toInstant().isBefore(now))
            departure = null;
        var resolved = new NavigationRouteRequest(request.originPlaceId(), request.destinationPlaceId(),
                request.travelMode(), departure);
        var options = routesGateway.computeRoutes(resolved);
        if (options.isEmpty()) throw new ApiException(ErrorCode.MAP_ROUTE_NOT_FOUND, "未找到可用路线");
        if (referenceTransit) {
            String warning = "计划日期超出 Google 公交时刻表范围，显示 "
                    + departure.format(TRANSIT_REFERENCE_FORMAT) + " 的参考班次。";
            options = options.stream().map(option -> withWarning(option, warning)).toList();
        }
        return new NavigationRouteOptionsResponse(request.travelMode(), options, false, false, now, null);
    }
    private NavigationRouteResponse withWarning(NavigationRouteResponse option, String warning) {
        var warnings = new ArrayList<>(option.warnings());
        warnings.add(warning);
        return new NavigationRouteResponse(option.optionId(), option.recommended(), option.travelMode(),
                option.distanceMeters(), option.durationSeconds(), option.distanceText(), option.durationText(),
                option.encodedPolyline(), option.steps(), List.copyOf(warnings));
    }
    OffsetDateTime resolveDeparture(NavigationRouteRequest request) {
        if (request.departureTime() != null) return request.departureTime();
        if (request.dailyRouteId() == null || request.originPointId() == null)
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "需要出发时间，或每日路线与出发地点");
        DailyRoute day = days.findById(request.dailyRouteId())
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "每日路线不存在"));
        RoutePoint origin = points.findByIdAndDailyRouteId(request.originPointId(), day.getId())
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "出发地点不在当天路线中"));
        if (!origin.getGooglePlaceId().equals(request.originPlaceId()))
            throw new ApiException(ErrorCode.BAD_REQUEST, "出发 Place ID 与地点不匹配");
        String planned = request.plannedDepartureTime();
        if (request.destinationPointId() != null) {
            RoutePoint destination = points.findByIdAndDailyRouteId(request.destinationPointId(), day.getId())
                    .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "到达地点不在当天路线中"));
            if (!destination.getGooglePlaceId().equals(request.destinationPlaceId())
                    || destination.getSortOrder() != origin.getSortOrder() + 1)
                throw new ApiException(ErrorCode.BAD_REQUEST, "只能计算相邻地点路线");
            if (planned == null) planned = selections
                    .findByDailyRouteIdAndOriginPointIdAndDestinationPointId(day.getId(), origin.getId(), destination.getId())
                    .map(NavigationSelection::getDepartureTime).orElse(null);
        }
        if (planned == null) planned = origin.getDepartureTime();
        LocalDateTime local = day.getRouteDate().atTime(planned == null ? LocalTime.of(9, 0) : LocalTime.parse(planned));
        ZoneId zone = ZoneId.of(day.getTripPlan().getTimezone());
        var offsets = zone.getRules().getValidOffsets(local);
        if (offsets.size() != 1)
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "该当地时间处于夏令时跳转或重复区间，请明确提供带偏移的出发时间");
        return local.atOffset(offsets.get(0));
    }
}

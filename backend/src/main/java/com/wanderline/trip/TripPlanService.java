package com.wanderline.trip;

import com.wanderline.common.error.ApiException;
import com.wanderline.common.error.ErrorCode;
import com.wanderline.navigation.NavigationSelectionInvalidationService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;

@Service
public class TripPlanService {

    @jakarta.persistence.PersistenceContext
    private jakarta.persistence.EntityManager entityManager;

    @org.springframework.beans.factory.annotation.Autowired
    private jakarta.validation.Validator validator;

    private static final int MAX_TRIP_DAYS = 60;
    private static final int MAX_ROUTE_POINTS = 30;
    private static final List<String> ROUTE_COLORS = List.of(
            "#E95F43", "#3D7A68", "#D29A2E", "#4E6FA8",
            "#A65E78", "#6D7045", "#9B633D", "#66717E"
    );

    private final TripPlanRepository repository;
    private final NavigationSelectionInvalidationService navigationInvalidationService;

    public TripPlanService(
            TripPlanRepository repository,
            NavigationSelectionInvalidationService navigationInvalidationService
    ) {
        this.repository = repository;
        this.navigationInvalidationService = navigationInvalidationService;
    }

    @Transactional(readOnly = true)
    public List<TripPlanSummaryResponse> listPlans() {
        return repository.findAllByOrderByUpdatedAtDesc().stream()
                .map(this::toSummary)
                .toList();
    }

    @Transactional(readOnly = true)
    public TripPlanDetailResponse getPlan(Long planId) {
        return toDetail(findPlan(planId));
    }

    @Transactional
    public TripPlanDetailResponse createPlan(TripPlanRequest request) {
        validateDateRange(request.startDate(), request.endDate());
        TripPlan plan = new TripPlan(
                request.title().trim(),
                request.destination().trim(),
                request.startDate(),
                request.endDate(),
                normalizeOptional(request.notes())
        );
        plan.setTimezone(validateTimezone(request.timezone()));
        addMissingDailyRoutes(plan);
        repository.saveAndFlush(plan);
        return toDetail(plan);
    }

    @Transactional
    public TripPlanDetailResponse updatePlan(Long planId, TripPlanRequest request) {
        validateDateRange(request.startDate(), request.endDate());
        TripPlan plan = findPlan(planId);

        boolean excludesExistingRoute = plan.getDailyRoutes().stream().anyMatch(route ->
                route.getRouteDate().isBefore(request.startDate()) || route.getRouteDate().isAfter(request.endDate())
        );
        if (excludesExistingRoute) {
            throw new ApiException(ErrorCode.CONFLICT, "新的日期范围会排除已有每日路线，请先调整或删除对应路线");
        }

        plan.setTimezone(validateTimezone(request.timezone() == null ? plan.getTimezone() : request.timezone()));
        plan.update(
                request.title().trim(),
                request.destination().trim(),
                request.startDate(),
                request.endDate(),
                normalizeOptional(request.notes())
        );
        repository.flush();
        return toDetail(plan);
    }

    @Transactional
    public TripPlanDetailResponse patchPlan(Long planId, java.util.Map<String, String> changes) {
        TripPlan plan = findPlan(planId);
        for (String key : changes.keySet()) {
            if (!Set.of("title", "destination", "timezone", "startDate", "endDate", "notes").contains(key))
                throw new ApiException(ErrorCode.VALIDATION_FAILED, "不支持的计划字段: " + key);
        }
        if (changes.containsKey("timezone") && changes.get("timezone") == null)
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "时区不能为空");
        TripPlanRequest merged = new TripPlanRequest(
                changes.getOrDefault("title", plan.getTitle()),
                changes.getOrDefault("destination", plan.getDestination()),
                changes.getOrDefault("timezone", plan.getTimezone()),
                changes.containsKey("startDate") ? parsePatchDate(changes.get("startDate")) : plan.getStartDate(),
                changes.containsKey("endDate") ? parsePatchDate(changes.get("endDate")) : plan.getEndDate(),
                changes.getOrDefault("notes", plan.getNotes()));
        var violations = validator.validate(merged);
        if (!violations.isEmpty()) throw new jakarta.validation.ConstraintViolationException(violations);
        return updatePlan(planId, merged);
    }

    private LocalDate parsePatchDate(String value) {
        if (value == null) return null;
        try { return LocalDate.parse(value); }
        catch (java.time.format.DateTimeParseException exception) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "计划日期必须是有效的 YYYY-MM-DD 日期");
        }
    }

    @Transactional
    public DeleteTripPlanResponse deletePlan(Long planId) {
        TripPlan plan = findPlan(planId);
        plan.getDailyRoutes().forEach(route ->
                navigationInvalidationService.invalidateDailyRoute(route.getId())
        );
        repository.delete(plan);
        return new DeleteTripPlanResponse(planId, true);
    }

    @Transactional
    public TripPlanDetailResponse createDailyRoute(Long planId, DailyRouteRequest request) {
        TripPlan plan = findPlan(planId);
        validateRouteDate(plan, request.routeDate());
        ensureDateAvailable(plan, request.routeDate(), null);
        plan.addDailyRoute(createRoute(plan, request));
        repository.saveAndFlush(plan);
        return toDetail(plan);
    }

    @Transactional
    public TripPlanDetailResponse generateDailyRoutes(Long planId) {
        TripPlan plan = findPlan(planId);
        addMissingDailyRoutes(plan);
        repository.saveAndFlush(plan);
        return toDetail(plan);
    }

    private void addMissingDailyRoutes(TripPlan plan) {
        Set<LocalDate> existingDates = new HashSet<>(plan.getDailyRoutes().stream()
                .map(DailyRoute::getRouteDate)
                .toList());

        LocalDate date = plan.getStartDate();
        while (!date.isAfter(plan.getEndDate())) {
            if (!existingDates.contains(date)) {
                int dayNumber = dayNumber(plan, date);
                plan.addDailyRoute(new DailyRoute(
                        plan,
                        date,
                        defaultDayTitle(dayNumber),
                        null,
                        defaultRouteColor(dayNumber)
                ));
            }
            date = date.plusDays(1);
        }
    }

    @Transactional
    public TripPlanDetailResponse updateDailyRoute(Long planId, Long dailyRouteId, DailyRouteRequest request) {
        TripPlan plan = findPlan(planId);
        DailyRoute route = findDailyRoute(plan, dailyRouteId);
        validateRouteDate(plan, request.routeDate());
        ensureDateAvailable(plan, request.routeDate(), dailyRouteId);

        int dayNumber = dayNumber(plan, request.routeDate());
        route.update(
                request.routeDate(),
                normalizeTitle(request.title(), dayNumber),
                normalizeOptional(request.notes()),
                normalizeColor(request.routeColor(), dayNumber)
        );
        plan.touch();
        repository.flush();
        return toDetail(plan);
    }

    @Transactional
    public TripPlanDetailResponse deleteDailyRoute(Long planId, Long dailyRouteId) {
        TripPlan plan = findPlan(planId);
        DailyRoute route = findDailyRoute(plan, dailyRouteId);
        navigationInvalidationService.invalidateDailyRoute(dailyRouteId);
        plan.removeDailyRoute(route);
        repository.flush();
        return toDetail(plan);
    }

    @Transactional
    public TripPlanDetailResponse addRoutePoint(
            Long planId,
            Long dailyRouteId,
            RoutePointRequest request
    ) {
        TripPlan plan = findPlan(planId);
        DailyRoute route = findDailyRoute(plan, dailyRouteId);
        if (route.getRoutePoints().size() >= MAX_ROUTE_POINTS) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "每日路线最多支持 30 个地点");
        }

        String placeId = request.googlePlaceId().trim();
        route.addRoutePoint(new RoutePoint(
                route,
                placeId,
                normalizeOptional(request.customName()),
                normalizeOptional(request.note()),
                request.arrivalTime(),
                request.departureTime(),
                route.getRoutePoints().size()
        ));
        plan.touch();
        repository.saveAndFlush(plan);
        return toDetail(plan);
    }

    @Transactional
    public TripPlanDetailResponse deleteRoutePoint(
            Long planId,
            Long dailyRouteId,
            Long routePointId
    ) {
        TripPlan plan = findPlan(planId);
        DailyRoute route = findDailyRoute(plan, dailyRouteId);
        RoutePoint point = findRoutePoint(route, routePointId);
        navigationInvalidationService.retainAdjacent(dailyRouteId, route.getRoutePoints().stream()
                .filter(p -> !p.getId().equals(routePointId)).sorted(java.util.Comparator.comparingInt(RoutePoint::getSortOrder))
                .map(RoutePoint::getId).toList());
        route.removeRoutePoint(point);
        entityManager.remove(point);
        compactRoutePointOrder(route);
        plan.touch();
        repository.flush();
        return toDetail(plan);
    }

    @Transactional
    public TripPlanDetailResponse reorderRoutePoints(
            Long planId,
            Long dailyRouteId,
            ReorderRoutePointsRequest request
    ) {
        TripPlan plan = findPlan(planId);
        DailyRoute route = findDailyRoute(plan, dailyRouteId);
        List<Long> requestedIds = request.routePointIds();

        if (new HashSet<>(requestedIds).size() != requestedIds.size()) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "地点顺序中不能包含重复 ID");
        }
        if (requestedIds.size() != route.getRoutePoints().size()) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "地点顺序必须包含当天路线的全部地点");
        }

        List<Long> currentIds = route.getRoutePoints().stream()
                .sorted((left, right) -> Integer.compare(left.getSortOrder(), right.getSortOrder()))
                .map(RoutePoint::getId)
                .toList();

        var pointsById = new HashMap<Long, RoutePoint>();
        route.getRoutePoints().forEach(point -> pointsById.put(point.getId(), point));
        for (int index = 0; index < requestedIds.size(); index++) {
            RoutePoint point = pointsById.get(requestedIds.get(index));
            if (point == null) {
                throw new ApiException(ErrorCode.VALIDATION_FAILED, "地点顺序包含不属于当天路线的地点");
            }
            point.moveTo(index);
        }

        if (!currentIds.equals(requestedIds)) {
            navigationInvalidationService.retainAdjacent(dailyRouteId, requestedIds);
        }
        plan.touch();
        repository.flush();
        return toDetail(plan);
    }

    @Transactional
    public TripPlanDetailResponse updateStop(Long id, java.util.Map<String, String> changes) {
        RoutePoint point = entityManager.find(RoutePoint.class, id);
        if (point == null) throw new ApiException(ErrorCode.NOT_FOUND, "地点不存在");
        DailyRoute source = point.getDailyRoute();
        TripPlan plan = source.getTripPlan();
        for (String key : changes.keySet()) {
            if (!Set.of("customName", "note", "arrivalTime", "departureTime", "dailyRouteId").contains(key))
                throw new ApiException(ErrorCode.VALIDATION_FAILED, "不支持的地点字段: " + key);
            String value = changes.get(key);
            if (value != null && ((key.equals("customName") && value.length() > 200)
                    || (key.equals("note") && value.length() > 2000)
                    || ((key.equals("arrivalTime") || key.equals("departureTime"))
                    && !value.matches("^([01][0-9]|2[0-3]):[0-5][0-9]$"))))
                throw new ApiException(ErrorCode.VALIDATION_FAILED, "地点字段格式不正确: " + key);
        }
        point.update(changes.containsKey("customName") ? normalizeOptional(changes.get("customName")) : point.getCustomName(),
                changes.containsKey("note") ? normalizeOptional(changes.get("note")) : point.getNote(),
                changes.containsKey("arrivalTime") ? changes.get("arrivalTime") : point.getArrivalTime(),
                changes.containsKey("departureTime") ? changes.get("departureTime") : point.getDepartureTime());
        if (changes.get("dailyRouteId") != null) {
            Long targetId;
            try { targetId = Long.valueOf(changes.get("dailyRouteId")); }
            catch (NumberFormatException e) { throw new ApiException(ErrorCode.VALIDATION_FAILED, "每日路线 ID 无效"); }
            DailyRoute target = findDailyRoute(plan, targetId);
            if (!source.getId().equals(targetId)) {
                if (target.getRoutePoints().size() >= MAX_ROUTE_POINTS)
                    throw new ApiException(ErrorCode.VALIDATION_FAILED, "每日路线最多支持 30 个地点");
                var remaining = source.getRoutePoints().stream().filter(p -> !p.getId().equals(id))
                        .sorted(java.util.Comparator.comparingInt(RoutePoint::getSortOrder)).map(RoutePoint::getId).toList();
                navigationInvalidationService.retainAdjacent(source.getId(), remaining);
                source.removeRoutePoint(point);
                point.moveToDay(target, target.getRoutePoints().size());
                target.addRoutePoint(point);
                compactRoutePointOrder(source);
            }
        }
        plan.touch();
        repository.flush();
        return toDetail(plan);
    }

    @Transactional
    public TripPlanDetailResponse deleteStop(Long id) {
        RoutePoint point = entityManager.find(RoutePoint.class, id);
        if (point == null) throw new ApiException(ErrorCode.NOT_FOUND, "地点不存在");
        return deleteRoutePoint(point.getDailyRoute().getTripPlan().getId(), point.getDailyRoute().getId(), id);
    }

    private String validateTimezone(String timezone) {
        String zone = timezone == null ? "UTC" : timezone.trim();
        if (!java.time.ZoneId.getAvailableZoneIds().contains(zone))
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "请选择有效的 IANA 时区");
        return zone;
    }

    private TripPlan findPlan(Long planId) {
        return repository.findById(planId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "旅游计划不存在或已被删除"));
    }

    private DailyRoute findDailyRoute(TripPlan plan, Long dailyRouteId) {
        return plan.getDailyRoutes().stream()
                .filter(route -> dailyRouteId.equals(route.getId()))
                .findFirst()
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "每日路线不存在或已被删除"));
    }

    private RoutePoint findRoutePoint(DailyRoute route, Long routePointId) {
        return route.getRoutePoints().stream()
                .filter(point -> routePointId.equals(point.getId()))
                .findFirst()
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "路线地点不存在或已被删除"));
    }

    private void compactRoutePointOrder(DailyRoute route) {
        List<RoutePoint> orderedPoints = new ArrayList<>(route.getRoutePoints());
        orderedPoints.sort((left, right) -> Integer.compare(left.getSortOrder(), right.getSortOrder()));
        for (int index = 0; index < orderedPoints.size(); index++) {
            orderedPoints.get(index).moveTo(index);
        }
    }

    private DailyRoute createRoute(TripPlan plan, DailyRouteRequest request) {
        int dayNumber = dayNumber(plan, request.routeDate());
        return new DailyRoute(
                plan,
                request.routeDate(),
                normalizeTitle(request.title(), dayNumber),
                normalizeOptional(request.notes()),
                normalizeColor(request.routeColor(), dayNumber)
        );
    }

    private void validateDateRange(LocalDate startDate, LocalDate endDate) {
        if (endDate.isBefore(startDate)) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "结束日期不能早于开始日期");
        }
        long dayCount = ChronoUnit.DAYS.between(startDate, endDate) + 1;
        if (dayCount > MAX_TRIP_DAYS) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "单个旅游计划最多支持 60 天");
        }
    }

    private void validateRouteDate(TripPlan plan, LocalDate routeDate) {
        if (routeDate.isBefore(plan.getStartDate()) || routeDate.isAfter(plan.getEndDate())) {
            throw new ApiException(ErrorCode.VALIDATION_FAILED, "每日路线日期必须在计划日期范围内");
        }
    }

    private void ensureDateAvailable(TripPlan plan, LocalDate routeDate, Long ignoredRouteId) {
        boolean duplicate = plan.getDailyRoutes().stream().anyMatch(route ->
                route.getRouteDate().equals(routeDate) && !Objects.equals(route.getId(), ignoredRouteId)
        );
        if (duplicate) {
            throw new ApiException(ErrorCode.CONFLICT, "该日期已经创建了每日路线");
        }
    }

    private int dayNumber(TripPlan plan, LocalDate routeDate) {
        return Math.toIntExact(ChronoUnit.DAYS.between(plan.getStartDate(), routeDate) + 1);
    }

    private String normalizeTitle(String title, int dayNumber) {
        return title == null || title.isBlank() ? defaultDayTitle(dayNumber) : title.trim();
    }

    private String normalizeColor(String routeColor, int dayNumber) {
        return routeColor == null || routeColor.isBlank()
                ? defaultRouteColor(dayNumber)
                : routeColor.toUpperCase();
    }

    private String normalizeOptional(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String defaultDayTitle(int dayNumber) {
        return "第 " + dayNumber + " 天";
    }

    private String defaultRouteColor(int dayNumber) {
        return ROUTE_COLORS.get((dayNumber - 1) % ROUTE_COLORS.size());
    }

    private TripPlanSummaryResponse toSummary(TripPlan plan) {
        return new TripPlanSummaryResponse(
                plan.getId(),
                plan.getTitle(),
                plan.getDestination(),
                plan.getTimezone(),
                plan.getStartDate(),
                plan.getEndDate(),
                dayNumber(plan, plan.getEndDate()),
                plan.getDailyRoutes().size(),
                plan.getCreatedAt(),
                plan.getUpdatedAt()
        );
    }

    private TripPlanDetailResponse toDetail(TripPlan plan) {
        List<DailyRouteResponse> routes = plan.getDailyRoutes().stream()
                .sorted((left, right) -> left.getRouteDate().compareTo(right.getRouteDate()))
                .map(route -> new DailyRouteResponse(
                        route.getId(),
                        dayNumber(plan, route.getRouteDate()),
                        route.getRouteDate(),
                        route.getTitle(),
                        route.getNotes(),
                        route.getRouteColor(),
                        route.getRoutePoints().stream()
                                .sorted((left, right) -> Integer.compare(left.getSortOrder(), right.getSortOrder()))
                                .map(point -> new RoutePointResponse(
                                        point.getId(),
                                        point.getGooglePlaceId(),
                                        point.getCustomName(),
                                        point.getNote(),
                                        point.getArrivalTime(),
                                        point.getDepartureTime(),
                                        point.getSortOrder(),
                                        point.getCreatedAt(),
                                        point.getUpdatedAt()
                                ))
                                .toList(),
                        route.getCreatedAt(),
                        route.getUpdatedAt()
                ))
                .toList();

        return new TripPlanDetailResponse(
                plan.getId(),
                plan.getTitle(),
                plan.getDestination(),
                plan.getTimezone(),
                plan.getStartDate(),
                plan.getEndDate(),
                plan.getNotes(),
                dayNumber(plan, plan.getEndDate()),
                routes,
                plan.getCreatedAt(),
                plan.getUpdatedAt()
        );
    }
}

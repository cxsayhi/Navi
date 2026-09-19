package com.wanderline.trip;

import com.wanderline.common.error.ApiException;
import com.wanderline.navigation.NavigationSelectionInvalidationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.Optional;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;

@ExtendWith(MockitoExtension.class)
class TripPlanServiceTest {

    @Mock
    private TripPlanRepository repository;

    @Mock
    private NavigationSelectionInvalidationService navigationInvalidationService;

    private TripPlanService service;

    @BeforeEach
    void setUp() {
        service = new TripPlanService(repository, navigationInvalidationService);
        ReflectionTestUtils.setField(service, "entityManager", org.mockito.Mockito.mock(jakarta.persistence.EntityManager.class));
    }

    @Test
    void rejectsAnInvalidTripDateRange() {
        TripPlanRequest request = new TripPlanRequest(
                "东京散步",
                "东京",
                LocalDate.of(2026, 10, 3),
                LocalDate.of(2026, 10, 1),
                null
        );

        assertThatThrownBy(() -> service.createPlan(request))
                .isInstanceOf(ApiException.class)
                .hasMessage("结束日期不能早于开始日期");
    }

    @Test
    void generatesOnlyMissingDailyRoutes() {
        TripPlan plan = new TripPlan(
                "东京散步",
                "东京",
                LocalDate.of(2026, 10, 1),
                LocalDate.of(2026, 10, 3),
                null
        );
        plan.addDailyRoute(new DailyRoute(plan, LocalDate.of(2026, 10, 2), "咖啡馆日", null, "#3D7A68"));
        when(repository.findById(12L)).thenReturn(Optional.of(plan));

        TripPlanDetailResponse response = service.generateDailyRoutes(12L);

        assertThat(response.dailyRoutes()).hasSize(3);
        assertThat(response.dailyRoutes())
                .extracting(DailyRouteResponse::routeDate)
                .containsExactly(
                        LocalDate.of(2026, 10, 1),
                        LocalDate.of(2026, 10, 2),
                        LocalDate.of(2026, 10, 3)
                );
        assertThat(response.dailyRoutes().get(1).title()).isEqualTo("咖啡馆日");
    }

    @Test
    void rejectsDailyRouteOutsideThePlan() {
        TripPlan plan = new TripPlan(
                "东京散步",
                "东京",
                LocalDate.of(2026, 10, 1),
                LocalDate.of(2026, 10, 3),
                null
        );
        when(repository.findById(12L)).thenReturn(Optional.of(plan));

        DailyRouteRequest request = new DailyRouteRequest(
                LocalDate.of(2026, 10, 4),
                "返程",
                null,
                null
        );

        assertThatThrownBy(() -> service.createDailyRoute(12L, request))
                .isInstanceOf(ApiException.class)
                .hasMessage("每日路线日期必须在计划日期范围内");
    }

    @Test
    void addsAPlaceToTheEndOfADailyRoute() {
        TripPlan plan = planWithRoute();
        DailyRoute route = plan.getDailyRoutes().get(0);
        route.addRoutePoint(point(route, 101L, "place-a", "浅草寺", 0));
        when(repository.findById(12L)).thenReturn(Optional.of(plan));

        TripPlanDetailResponse response = service.addRoutePoint(
                12L,
                21L,
                new RoutePointRequest(" place-b ", " 东京晴空塔 ", "墨田区", "09:00", "10:00")
        );

        assertThat(response.dailyRoutes().get(0).routePoints()).hasSize(2);
        assertThat(response.dailyRoutes().get(0).routePoints().get(1))
                .extracting(RoutePointResponse::googlePlaceId, RoutePointResponse::customName, RoutePointResponse::position)
                .containsExactly("place-b", "东京晴空塔", 1);
    }

    @Test
    void allowsReturningToTheSamePlaceInTheSameDay() {
        TripPlan plan = planWithRoute();
        DailyRoute route = plan.getDailyRoutes().get(0);
        route.addRoutePoint(point(route, 101L, "place-a", "浅草寺", 0));
        when(repository.findById(12L)).thenReturn(Optional.of(plan));

        TripPlanDetailResponse result = service.addRoutePoint(12L, 21L,
                new RoutePointRequest("place-a", "再次拜访", null, null, null));
        assertThat(result.dailyRoutes().get(0).routePoints()).hasSize(2);
    }

    @Test
    void reordersAllPointsAndReturnsContiguousPositions() {
        TripPlan plan = planWithRoute();
        DailyRoute route = plan.getDailyRoutes().get(0);
        route.addRoutePoint(point(route, 101L, "place-a", "浅草寺", 0));
        route.addRoutePoint(point(route, 102L, "place-b", "上野公园", 1));
        route.addRoutePoint(point(route, 103L, "place-c", "东京站", 2));
        when(repository.findById(12L)).thenReturn(Optional.of(plan));

        TripPlanDetailResponse response = service.reorderRoutePoints(
                12L,
                21L,
                new ReorderRoutePointsRequest(List.of(103L, 101L, 102L))
        );

        assertThat(response.dailyRoutes().get(0).routePoints())
                .extracting(RoutePointResponse::id)
                .containsExactly(103L, 101L, 102L);
        assertThat(response.dailyRoutes().get(0).routePoints())
                .extracting(RoutePointResponse::position)
                .containsExactly(0, 1, 2);
        verify(navigationInvalidationService).retainAdjacent(21L, List.of(103L, 101L, 102L));
    }

    @Test
    void keepsSavedNavigationWhenPointOrderDidNotChange() {
        TripPlan plan = planWithRoute();
        DailyRoute route = plan.getDailyRoutes().get(0);
        route.addRoutePoint(point(route, 101L, "place-a", "浅草寺", 0));
        route.addRoutePoint(point(route, 102L, "place-b", "上野公园", 1));
        when(repository.findById(12L)).thenReturn(Optional.of(plan));

        service.reorderRoutePoints(
                12L,
                21L,
                new ReorderRoutePointsRequest(List.of(101L, 102L))
        );

        verify(navigationInvalidationService, never()).invalidateDailyRoute(21L);
    }

    @Test
    void rejectsAnIncompletePointOrder() {
        TripPlan plan = planWithRoute();
        DailyRoute route = plan.getDailyRoutes().get(0);
        route.addRoutePoint(point(route, 101L, "place-a", "浅草寺", 0));
        route.addRoutePoint(point(route, 102L, "place-b", "上野公园", 1));
        when(repository.findById(12L)).thenReturn(Optional.of(plan));

        assertThatThrownBy(() -> service.reorderRoutePoints(
                12L,
                21L,
                new ReorderRoutePointsRequest(List.of(101L))
        ))
                .isInstanceOf(ApiException.class)
                .hasMessage("地点顺序必须包含当天路线的全部地点");
    }

    @Test
    void compactsPositionsAfterDeletingAPoint() {
        TripPlan plan = planWithRoute();
        DailyRoute route = plan.getDailyRoutes().get(0);
        route.addRoutePoint(point(route, 101L, "place-a", "浅草寺", 0));
        route.addRoutePoint(point(route, 102L, "place-b", "上野公园", 1));
        route.addRoutePoint(point(route, 103L, "place-c", "东京站", 2));
        when(repository.findById(12L)).thenReturn(Optional.of(plan));

        TripPlanDetailResponse response = service.deleteRoutePoint(12L, 21L, 102L);

        assertThat(response.dailyRoutes().get(0).routePoints())
                .extracting(RoutePointResponse::id)
                .containsExactly(101L, 103L);
        assertThat(response.dailyRoutes().get(0).routePoints())
                .extracting(RoutePointResponse::position)
                .containsExactly(0, 1);
        verify(navigationInvalidationService).retainAdjacent(21L, List.of(101L, 103L));
    }

    private TripPlan planWithRoute() {
        TripPlan plan = new TripPlan(
                "东京散步",
                "东京",
                LocalDate.of(2026, 10, 1),
                LocalDate.of(2026, 10, 3),
                null
        );
        DailyRoute route = new DailyRoute(
                plan,
                LocalDate.of(2026, 10, 1),
                "老城散步",
                null,
                "#E95F43"
        );
        ReflectionTestUtils.setField(route, "id", 21L);
        plan.addDailyRoute(route);
        return plan;
    }

    private RoutePoint point(DailyRoute route, Long id, String placeId, String name, int sortOrder) {
        RoutePoint point = new RoutePoint(
                route,
                placeId,
                name,
                name + " 地址",
                "09:00", "10:00",
                sortOrder
        );
        ReflectionTestUtils.setField(point, "id", id);
        return point;
    }
}

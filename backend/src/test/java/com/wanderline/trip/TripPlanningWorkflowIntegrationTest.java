package com.wanderline.trip;

import com.wanderline.navigation.NavigationRouteResponse;
import com.wanderline.navigation.NavigationSelectionService;
import com.wanderline.navigation.SaveNavigationSelectionRequest;
import com.wanderline.navigation.TravelMode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:trip-planning-workflow;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false"
})
@Transactional
class TripPlanningWorkflowIntegrationTest {

    @Autowired
    private TripPlanService tripPlanService;

    @Autowired
    private NavigationSelectionService navigationSelectionService;

    @Test
    void persistsAThreeDayPlanAndInvalidatesOnlyTheChangedDaysRoutes() {
        LocalDate startDate = LocalDate.of(2026, 12, 1);
        TripPlanDetailResponse plan = tripPlanService.createPlan(new TripPlanRequest(
                "上海三日自动化旅程",
                "上海",
                startDate,
                startDate.plusDays(2),
                "阶段 8 完整工作流"
        ));
        plan = tripPlanService.generateDailyRoutes(plan.id());
        assertThat(plan.dailyRoutes()).hasSize(3);

        List<List<String>> placeNames = List.of(
                List.of("上海博物馆", "外滩"),
                List.of("豫园", "东方明珠"),
                List.of("武康大楼", "上海动物园")
        );
        for (int dayIndex = 0; dayIndex < plan.dailyRoutes().size(); dayIndex++) {
            Long dailyRouteId = plan.dailyRoutes().get(dayIndex).id();
            for (int pointIndex = 0; pointIndex < placeNames.get(dayIndex).size(); pointIndex++) {
                String name = placeNames.get(dayIndex).get(pointIndex);
                plan = tripPlanService.addRoutePoint(
                        plan.id(),
                        dailyRouteId,
                        new RoutePointRequest(
                                "stage8-" + dayIndex + "-" + pointIndex,
                                name,
                                name + "地址",
                                "09:00", "10:00"
                        )
                );
            }
        }

        DailyRouteResponse firstDay = plan.dailyRoutes().get(0);
        Long firstPointId = firstDay.routePoints().get(0).id();
        Long secondPointId = firstDay.routePoints().get(1).id();
        plan = tripPlanService.reorderRoutePoints(
                plan.id(),
                firstDay.id(),
                new ReorderRoutePointsRequest(List.of(secondPointId, firstPointId))
        );
        assertThat(plan.dailyRoutes().get(0).routePoints())
                .extracting(RoutePointResponse::customName)
                .containsExactly("外滩", "上海博物馆");

        List<TravelMode> modes = List.of(TravelMode.DRIVE, TravelMode.WALK, TravelMode.TRANSIT);
        List<Long> selectedDailyRouteIds = new ArrayList<>();
        for (int index = 0; index < plan.dailyRoutes().size(); index++) {
            DailyRouteResponse route = plan.dailyRoutes().get(index);
            RoutePointResponse origin = route.routePoints().get(0);
            RoutePointResponse destination = route.routePoints().get(1);
            TravelMode mode = modes.get(index);
            navigationSelectionService.saveSelection(new SaveNavigationSelectionRequest(
                    route.id(),
                    origin.id(),
                    destination.id(),
                    mode, "09:00"
            ));
            selectedDailyRouteIds.add(route.id());
        }

        TripPlanDetailResponse refreshed = tripPlanService.getPlan(plan.id());
        assertThat(refreshed.dailyRoutes()).hasSize(3);
        assertThat(refreshed.dailyRoutes())
                .allSatisfy(route -> assertThat(route.routePoints()).hasSize(2));
        assertThat(refreshed.dailyRoutes().get(0).routePoints())
                .extracting(RoutePointResponse::customName)
                .containsExactly("外滩", "上海博物馆");
        assertThat(navigationSelectionService.getSelectionsForTripPlan(plan.id()).selections())
                .extracting(selection -> selection.travelMode())
                .containsExactlyInAnyOrderElementsOf(modes);

        TripPlanDetailResponse changed = tripPlanService.reorderRoutePoints(
                plan.id(),
                firstDay.id(),
                new ReorderRoutePointsRequest(List.of(firstPointId, secondPointId))
        );

        assertThat(changed.dailyRoutes().get(0).routePoints())
                .extracting(RoutePointResponse::customName)
                .containsExactly("上海博物馆", "外滩");
        assertThat(navigationSelectionService.getSelectionsForTripPlan(plan.id()).selections())
                .extracting(selection -> selection.dailyRouteId())
                .containsExactlyInAnyOrder(
                        selectedDailyRouteIds.get(1),
                        selectedDailyRouteIds.get(2)
                );
    }

    private NavigationRouteResponse navigationRoute(TravelMode mode, String optionId) {
        return new NavigationRouteResponse(
                optionId,
                true,
                mode,
                2200,
                1500,
                "2.2 公里",
                "25 分钟",
                "stage8-polyline",
                List.of(),
                List.of()
        );
    }
}

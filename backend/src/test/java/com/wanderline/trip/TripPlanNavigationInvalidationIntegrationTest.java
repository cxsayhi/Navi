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
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:navigation-invalidation;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false"
})
@Transactional
class TripPlanNavigationInvalidationIntegrationTest {

    @Autowired
    private TripPlanService tripPlanService;

    @Autowired
    private NavigationSelectionService navigationSelectionService;

    @Test
    void reorderingPinsReturnsTheUpdatedPlanAndInvalidatesSavedNavigation() {
        LocalDate routeDate = LocalDate.of(2026, 11, 1);
        TripPlanDetailResponse plan = tripPlanService.createPlan(new TripPlanRequest(
                "路线失效集成测试",
                "上海",
                routeDate,
                routeDate,
                null
        ));
        plan = tripPlanService.generateDailyRoutes(plan.id());
        Long dailyRouteId = plan.dailyRoutes().get(0).id();

        plan = tripPlanService.addRoutePoint(
                plan.id(),
                dailyRouteId,
                new RoutePointRequest("place-a", "上海博物馆", "人民大道", "09:00", "10:00")
        );
        plan = tripPlanService.addRoutePoint(
                plan.id(),
                dailyRouteId,
                new RoutePointRequest("place-b", "外滩", "中山东一路", "09:00", "10:00")
        );
        Long originId = plan.dailyRoutes().get(0).routePoints().get(0).id();
        Long destinationId = plan.dailyRoutes().get(0).routePoints().get(1).id();

        navigationSelectionService.saveSelection(new SaveNavigationSelectionRequest(
                dailyRouteId,
                originId,
                destinationId,
                TravelMode.WALK, "09:00"
        ));
        assertThat(navigationSelectionService.getSelectionsForTripPlan(plan.id()).selections())
                .hasSize(1);

        TripPlanDetailResponse reordered = tripPlanService.reorderRoutePoints(
                plan.id(),
                dailyRouteId,
                new ReorderRoutePointsRequest(List.of(destinationId, originId))
        );

        assertThat(reordered.dailyRoutes().get(0).routePoints())
                .extracting(RoutePointResponse::id)
                .containsExactly(destinationId, originId);
        assertThat(navigationSelectionService.getSelectionsForTripPlan(plan.id()).selections())
                .isEmpty();
    }
}

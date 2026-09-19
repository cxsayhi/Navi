package com.wanderline.trip;

import com.wanderline.navigation.NavigationRouteResponse;
import com.wanderline.navigation.NavigationSelectionService;
import com.wanderline.navigation.SaveNavigationSelectionRequest;
import com.wanderline.navigation.TravelMode;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:trip-plan-acceptance;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.flyway.enabled=false"
})
@Transactional
class TripPlanAcceptanceIntegrationTest {

    @Autowired
    private TripPlanService tripPlanService;

    @Autowired
    private TripPlanRepository tripPlanRepository;

    @Autowired
    private NavigationSelectionService navigationSelectionService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private WebApplicationContext webApplicationContext;

    private MockMvc mockMvc;

    @BeforeEach
    void configureMockMvc() {
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).build();
    }

    @Test
    void generatesCorrectDaysForSingleAndMultiDayPlansAndPersistsUpdates() {
        LocalDate singleDate = LocalDate.of(2027, 1, 10);
        TripPlanDetailResponse singleDay = tripPlanService.createPlan(new TripPlanRequest(
                "杭州一日游", "杭州", singleDate, singleDate, null
        ));

        assertThat(singleDay.dayCount()).isEqualTo(1);
        assertThat(singleDay.dailyRoutes()).singleElement().satisfies(route -> {
            assertThat(route.dayNumber()).isEqualTo(1);
            assertThat(route.routeDate()).isEqualTo(singleDate);
            assertThat(route.title()).isEqualTo("第 1 天");
        });

        LocalDate startDate = LocalDate.of(2027, 2, 1);
        TripPlanDetailResponse multiDay = tripPlanService.createPlan(new TripPlanRequest(
                "苏州三日游", "苏州", startDate, startDate.plusDays(2), "验收计划"
        ));

        assertThat(multiDay.dailyRoutes())
                .extracting(DailyRouteResponse::dayNumber)
                .containsExactly(1, 2, 3);
        assertThat(multiDay.dailyRoutes())
                .extracting(DailyRouteResponse::routeDate)
                .containsExactly(startDate, startDate.plusDays(1), startDate.plusDays(2));
        assertThat(multiDay.dailyRoutes())
                .extracting(DailyRouteResponse::routeColor)
                .doesNotHaveDuplicates();

        TripPlanDetailResponse updated = tripPlanService.updatePlan(
                multiDay.id(),
                new TripPlanRequest("苏州园林四日游", "苏州", startDate, startDate.plusDays(3), "已修改")
        );
        updated = tripPlanService.generateDailyRoutes(updated.id());

        assertThat(updated.title()).isEqualTo("苏州园林四日游");
        assertThat(updated.endDate()).isEqualTo(startDate.plusDays(3));
        assertThat(updated.dayCount()).isEqualTo(4);
        assertThat(updated.dailyRoutes())
                .extracting(DailyRouteResponse::dayNumber)
                .containsExactly(1, 2, 3, 4);
    }

    @Test
    void deletingAPlanCascadesThroughRoutesPointsAndNavigationSelections() {
        TripPlanDetailResponse plan = planWithPoints("级联删除验收", 2);
        DailyRouteResponse route = plan.dailyRoutes().get(0);
        saveNavigation(route);
        simulateNextRequest();

        assertThat(countRows("trip_plans")).isEqualTo(1);
        assertThat(countRows("daily_routes")).isEqualTo(1);
        assertThat(countRows("route_points")).isEqualTo(2);
        assertThat(countRows("navigation_selections")).isEqualTo(1);

        tripPlanService.deletePlan(plan.id());
        tripPlanRepository.flush();

        assertThat(countRows("trip_plans")).isZero();
        assertThat(countRows("daily_routes")).isZero();
        assertThat(countRows("route_points")).isZero();
        assertThat(countRows("navigation_selections")).isZero();
        assertThatThrownBy(() -> tripPlanService.getPlan(plan.id()))
                .hasMessage("旅游计划不存在或已被删除");
    }

    @Test
    void deletingFirstMiddleAndLastPinsCompactsOrderAndRemovesOldRoutes() {
        for (int deleteIndex : List.of(0, 1, 3)) {
            TripPlanDetailResponse plan = planWithPoints("Pin 删除验收 " + deleteIndex, 4);
            DailyRouteResponse route = plan.dailyRoutes().get(0);
            saveNavigation(route);
            simulateNextRequest();

            TripPlanDetailResponse changed = tripPlanService.deleteRoutePoint(
                    plan.id(), route.id(), route.routePoints().get(deleteIndex).id()
            );

            assertThat(changed.dailyRoutes().get(0).routePoints())
                    .extracting(RoutePointResponse::position)
                    .containsExactly(0, 1, 2);
            assertThat(navigationSelectionService.getSelectionsForTripPlan(plan.id()).selections())
                    .hasSize(deleteIndex == 3 ? 1 : 0);
            tripPlanService.deletePlan(plan.id());
            tripPlanRepository.flush();
        }
    }

    @Test
    void returnsClearErrorsForInvalidRangesAndResourceIds() throws Exception {
        mockMvc.perform(post("/api/trip-plans")
                        .contentType("application/json")
                        .content("""
                                {
                                  "title": "错误日期",
                                  "destination": "上海",
                                  "startDate": "2027-03-03",
                                  "endDate": "2027-03-01",
                                  "notes": ""
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.error.message").value("结束日期不能早于开始日期"));

        mockMvc.perform(get("/api/trip-plans/0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_FAILED"));

        mockMvc.perform(get("/api/trip-plans/999999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.message").value("旅游计划不存在或已被删除"));

        TripPlanDetailResponse plan = planWithPoints("非法 Pin ID", 1);
        Long routeId = plan.dailyRoutes().get(0).id();
        mockMvc.perform(delete("/api/trip-plans/{planId}/daily-routes/{routeId}/route-points/{pointId}",
                        plan.id(), routeId, 999999L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.message").value("路线地点不存在或已被删除"));
    }

    @Test
    void editsAndMovesStopsWithoutLosingIdsOrUnchangedAdjacentPreferences() throws Exception {
        TripPlanDetailResponse plan = planWithPoints("移动编辑", 4);
        DailyRouteResponse day = plan.dailyRoutes().get(0);
        saveNavigation(day);
        Long first = day.routePoints().get(0).id();
        Long second = day.routePoints().get(1).id();
        Long third = day.routePoints().get(2).id();
        Long fourth = day.routePoints().get(3).id();
        tripPlanService.reorderRoutePoints(plan.id(), day.id(), new ReorderRoutePointsRequest(List.of(third, first, second, fourth)));
        assertThat(navigationSelectionService.getSelectionsForTripPlan(plan.id()).selections()).hasSize(1);
        plan = tripPlanService.updatePlan(plan.id(), new TripPlanRequest("移动编辑", "上海", "Asia/Shanghai",
                plan.startDate(), plan.endDate().plusDays(1), null));
        plan = tripPlanService.generateDailyRoutes(plan.id());
        Long target = plan.dailyRoutes().get(1).id();
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/stops/{id}", third)
                .contentType("application/json").content("{\"customName\":\"用户名称\",\"note\":\"我的备注\",\"arrivalTime\":\"09:30\",\"departureTime\":\"10:00\",\"dailyRouteId\":" + target + "}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.timezone").value("Asia/Shanghai"));
        simulateNextRequest();
        TripPlanDetailResponse restored = tripPlanService.getPlan(plan.id());
        assertThat(restored.dailyRoutes().get(1).routePoints()).singleElement().satisfies(point -> {
            assertThat(point.id()).isEqualTo(third);
            assertThat(point.customName()).isEqualTo("用户名称");
            assertThat(point.departureTime()).isEqualTo("10:00");
        });
        assertThat(navigationSelectionService.getSelectionsForTripPlan(plan.id()).selections()).hasSize(1);
        mockMvc.perform(get("/api/trips/{id}", plan.id())).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dailyRoutes[1].routePoints[0].latitude").doesNotExist())
                .andExpect(jsonPath("$.data.dailyRoutes[1].routePoints[0].name").doesNotExist());
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/stops/{id}", third)
                .contentType("application/json").content("{\"departureTime\":\"25:00\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(delete("/api/stops/{id}", third)).andExpect(status().isOk());
        simulateNextRequest();
        assertThat(tripPlanService.getPlan(plan.id()).dailyRoutes().get(1).routePoints()).isEmpty();
    }

    @Test
    void validatesTimezoneAndAcceptsPlaceIdWithoutGoogleContent() throws Exception {
        mockMvc.perform(post("/api/trips").contentType("application/json").content("""
                {"title":"T","destination":"Tokyo","startDate":"2027-01-01","endDate":"2027-01-01","timezone":"Mars/Olympus"}
                """)).andExpect(status().isBadRequest());
        TripPlanDetailResponse plan = planWithPoints("Place ID only", 0);
        mockMvc.perform(post("/api/trips/{id}/days/{day}/stops", plan.id(), plan.dailyRoutes().get(0).id())
                .contentType("application/json").content("{\"googlePlaceId\":\"place-only\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.dailyRoutes[0].routePoints[0].googlePlaceId").value("place-only"));
    }

    @Test
    void patchesOnlyProvidedTripFieldsAndPreservesDateConstraints() throws Exception {
        TripPlanDetailResponse plan = tripPlanService.createPlan(new TripPlanRequest("原名称", "上海",
                "Asia/Shanghai", LocalDate.of(2027, 4, 1), LocalDate.of(2027, 4, 2), "待清空备注"));
        var patch = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/trips/{id}", plan.id());
        mockMvc.perform(patch.contentType("application/json").content("{\"title\":\"新名称\",\"notes\":null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("新名称"))
                .andExpect(jsonPath("$.data.destination").value("上海"))
                .andExpect(jsonPath("$.data.timezone").value("Asia/Shanghai"))
                .andExpect(jsonPath("$.data.startDate").value("2027-04-01"))
                .andExpect(jsonPath("$.data.notes").doesNotExist());
        simulateNextRequest();
        assertThat(tripPlanService.getPlan(plan.id()).title()).isEqualTo("新名称");
        assertThat(tripPlanService.getPlan(plan.id()).notes()).isNull();
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/trips/{id}", plan.id())
                .contentType("application/json").content("{\"startDate\":\"2027-04-02\"}"))
                .andExpect(status().isConflict());
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/trips/{id}", plan.id())
                .contentType("application/json").content("{\"startDate\":null}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/trips/{id}", plan.id())
                .contentType("application/json").content("{\"title\":\" \"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch("/api/trips/{id}", plan.id())
                .contentType("application/json").content("{\"endDate\":\"not-a-date\"}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put("/api/trips/{id}", plan.id())
                .contentType("application/json").content("{\"title\":\"Incomplete PUT\"}"))
                .andExpect(status().isBadRequest());
    }

    private TripPlanDetailResponse planWithPoints(String title, int pointCount) {
        LocalDate date = LocalDate.of(2027, 4, 1);
        TripPlanDetailResponse plan = tripPlanService.createPlan(new TripPlanRequest(
                title, "上海", date, date, null
        ));
        plan = tripPlanService.generateDailyRoutes(plan.id());
        Long routeId = plan.dailyRoutes().get(0).id();
        for (int index = 0; index < pointCount; index++) {
            plan = tripPlanService.addRoutePoint(
                    plan.id(),
                    routeId,
                    new RoutePointRequest(
                            title + "-place-" + index,
                            "地点 " + index,
                            "测试地址 " + index,
                            "09:00", "10:00"
                    )
            );
        }
        return plan;
    }

    private void saveNavigation(DailyRouteResponse route) {
        navigationSelectionService.saveSelection(new SaveNavigationSelectionRequest(
                route.id(),
                route.routePoints().get(0).id(),
                route.routePoints().get(1).id(),
                TravelMode.WALK, "09:00"
        ));
    }

    private int countRows(String tableName) {
        Integer count = jdbcTemplate.queryForObject("select count(*) from " + tableName, Integer.class);
        return count == null ? 0 : count;
    }

    private void simulateNextRequest() {
        entityManager.flush();
        entityManager.clear();
    }
}

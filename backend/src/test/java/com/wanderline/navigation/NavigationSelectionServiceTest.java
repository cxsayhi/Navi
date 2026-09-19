package com.wanderline.navigation;

import tools.jackson.databind.ObjectMapper;
import com.wanderline.common.error.ApiException;
import com.wanderline.trip.DailyRoute;
import com.wanderline.trip.DailyRouteRepository;
import com.wanderline.trip.RoutePoint;
import com.wanderline.trip.RoutePointRepository;
import com.wanderline.trip.TripPlanRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NavigationSelectionServiceTest {

    @Mock
    private NavigationSelectionRepository selectionRepository;

    @Mock
    private DailyRouteRepository dailyRouteRepository;

    @Mock
    private RoutePointRepository routePointRepository;

    @Mock
    private TripPlanRepository tripPlanRepository;

    private NavigationSelectionService service;

    @BeforeEach
    void setUp() {
        service = new NavigationSelectionService(
                selectionRepository,
                dailyRouteRepository,
                routePointRepository,
                tripPlanRepository
        );
    }

    @Test
    void savesASelectedOptionForAnAdjacentSegment() {
        DailyRoute dailyRoute = org.mockito.Mockito.mock(DailyRoute.class);
        RoutePoint origin = point(101L, 0);
        RoutePoint destination = point(102L, 1);
        when(dailyRoute.getId()).thenReturn(21L);
        when(dailyRouteRepository.findById(21L)).thenReturn(Optional.of(dailyRoute));
        when(routePointRepository.findByIdAndDailyRouteId(101L, 21L)).thenReturn(Optional.of(origin));
        when(routePointRepository.findByIdAndDailyRouteId(102L, 21L)).thenReturn(Optional.of(destination));
        when(selectionRepository.findByDailyRouteIdAndOriginPointIdAndDestinationPointId(21L, 101L, 102L))
                .thenReturn(Optional.empty());
        when(selectionRepository.saveAndFlush(any())).thenAnswer(invocation -> {
            NavigationSelection selection = invocation.getArgument(0);
            ReflectionTestUtils.setField(selection, "id", 301L);
            ReflectionTestUtils.setField(selection, "updatedAt", Instant.parse("2026-07-20T10:00:00Z"));
            return selection;
        });

        NavigationSelectionResponse response = service.saveSelection(new SaveNavigationSelectionRequest(
                21L,
                101L,
                102L,
                TravelMode.DRIVE, "10:00"
        ));

        assertThat(response.id()).isEqualTo(301L);
        assertThat(response.travelMode()).isEqualTo(TravelMode.DRIVE);
        assertThat(response.departureTime()).isEqualTo("10:00");
        assertThat(response.status()).isEqualTo("PLANNED");
        assertThat(response.savedAt()).isEqualTo(Instant.parse("2026-07-20T10:00:00Z"));
    }

    @Test
    void rejectsSavingForNonAdjacentPoints() {
        DailyRoute dailyRoute = org.mockito.Mockito.mock(DailyRoute.class);
        RoutePoint origin = point(101L, 0);
        RoutePoint destination = point(103L, 2);
        when(dailyRouteRepository.findById(21L)).thenReturn(Optional.of(dailyRoute));
        when(routePointRepository.findByIdAndDailyRouteId(101L, 21L)).thenReturn(Optional.of(origin));
        when(routePointRepository.findByIdAndDailyRouteId(103L, 21L)).thenReturn(Optional.of(destination));

        assertThatThrownBy(() -> service.saveSelection(new SaveNavigationSelectionRequest(
                21L,
                101L,
                103L,
                TravelMode.DRIVE, "10:00"
        )))
                .isInstanceOf(ApiException.class)
                .hasMessage("只能为当前相邻 Pin 保存导航方案");
    }

    @Test
    void listsAllSavedSelectionsForATripPlan() {
        when(tripPlanRepository.existsById(8L)).thenReturn(true);
        when(selectionRepository.findAllByTripPlanId(8L)).thenReturn(List.of());

        TripPlanNavigationSelectionsResponse response = service.getSelectionsForTripPlan(8L);

        assertThat(response.tripPlanId()).isEqualTo(8L);
        assertThat(response.selections()).isEmpty();
    }

    @Test
    void rejectsPreviewSelectionLookupForAMissingTripPlan() {
        when(tripPlanRepository.existsById(404L)).thenReturn(false);

        assertThatThrownBy(() -> service.getSelectionsForTripPlan(404L))
                .isInstanceOf(ApiException.class)
                .hasMessage("旅游计划不存在");
    }

    private RoutePoint point(Long id, int sortOrder) {
        RoutePoint point = org.mockito.Mockito.mock(RoutePoint.class);
        org.mockito.Mockito.lenient().when(point.getId()).thenReturn(id);
        when(point.getSortOrder()).thenReturn(sortOrder);
        return point;
    }

    private NavigationRouteResponse route() {
        return new NavigationRouteResponse(
                "drive-primary",
                true,
                TravelMode.DRIVE,
                3200,
                840,
                "3.2 公里",
                "14 分钟",
                "encoded-drive-path",
                List.of(),
                List.of()
        );
    }
}

package com.wanderline.navigation;
import com.wanderline.common.error.*;
import com.wanderline.trip.*;
import org.junit.jupiter.api.*;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
class NavigationServiceTest {
    GoogleRoutesGateway gateway = mock(GoogleRoutesGateway.class);
    DailyRouteRepository days = mock(DailyRouteRepository.class);
    RoutePointRepository points = mock(RoutePointRepository.class);
    NavigationSelectionRepository selections = mock(NavigationSelectionRepository.class);
    NavigationService service = new NavigationService(gateway, days, points, selections);
    NavigationRouteRequest request = new NavigationRouteRequest("a","b", TravelMode.TRANSIT, OffsetDateTime.now().plusDays(1));
    NavigationRouteResponse option = new NavigationRouteResponse("x",true,TravelMode.TRANSIT,1,1,"1m","1s","polyline",List.of(),List.of());
    @Test void alwaysFetchesAndNeverFallsBackToCachedContent() {
        when(gateway.computeRoutes(request)).thenReturn(List.of(option)).thenReturn(List.of(option))
                .thenThrow(new ApiException(ErrorCode.MAP_PROVIDER_ERROR,"provider unavailable"));
        assertThat(service.computeRouteOptions(request).cached()).isFalse();
        assertThat(service.computeRouteOptions(request).cached()).isFalse();
        assertThatThrownBy(() -> service.computeRouteOptions(request)).hasMessage("provider unavailable");
        verify(gateway,times(3)).computeRoutes(request);
    }
    @Test void rejectsIdenticalPlacesAndUnsupportedTransitTime() {
        assertThatThrownBy(() -> service.computeRoute(new NavigationRouteRequest("a","a",TravelMode.WALK,request.departureTime())))
                .hasMessage("出发地点和到达地点不能相同");
        assertThatThrownBy(() -> service.computeRoute(new NavigationRouteRequest("a","b",TravelMode.TRANSIT,OffsetDateTime.now().plusDays(101))))
                .isInstanceOf(ApiException.class);
        verifyNoInteractions(gateway);
    }
    @Test void computesPastDrivingPlansWithoutSendingAHistoricalDeparture() {
        var past = OffsetDateTime.now().minusDays(1);
        var input = new NavigationRouteRequest("a", "b", TravelMode.DRIVE, past);
        var trafficUnaware = new NavigationRouteRequest("a", "b", TravelMode.DRIVE, null);
        var driveOption = new NavigationRouteResponse("drive", true, TravelMode.DRIVE,
                1, 1, "1m", "1s", "polyline", List.of(), List.of());
        when(gateway.computeRoutes(trafficUnaware)).thenReturn(List.of(driveOption));

        assertThat(service.computeRouteOptions(input).options()).containsExactly(driveOption);
        verify(gateway).computeRoutes(trafficUnaware);
    }
    @Test void usesUpcomingMatchingWeekdayForExpiredTransitPlans() {
        var past = OffsetDateTime.now(ZoneOffset.UTC).minusDays(30).withSecond(0).withNano(0);
        var input = new NavigationRouteRequest("a", "b", TravelMode.TRANSIT, past);
        when(gateway.computeRoutes(any())).thenReturn(List.of(option));

        var response = service.computeRouteOptions(input);

        var captor = org.mockito.ArgumentCaptor.forClass(NavigationRouteRequest.class);
        verify(gateway).computeRoutes(captor.capture());
        var reference = captor.getValue().departureTime();
        assertThat(reference.getDayOfWeek()).isEqualTo(past.getDayOfWeek());
        assertThat(reference.toLocalTime()).isEqualTo(past.toLocalTime());
        assertThat(reference.toInstant()).isAfter(Instant.now());
        assertThat(reference.toInstant()).isBefore(Instant.now().plus(Duration.ofDays(7)));
        assertThat(response.options().get(0).warnings()).singleElement().asString().contains("参考班次");
    }
    @Test void rejectsDstGapAndOverlapUnlessAnExplicitOffsetIsProvided() {
        DailyRoute day = mock(DailyRoute.class);
        TripPlan trip = mock(TripPlan.class);
        RoutePoint origin = mock(RoutePoint.class);
        when(days.findById(1L)).thenReturn(Optional.of(day));
        when(day.getId()).thenReturn(1L);
        when(day.getTripPlan()).thenReturn(trip);
        when(trip.getTimezone()).thenReturn("America/New_York");
        when(points.findByIdAndDailyRouteId(2L, 1L)).thenReturn(Optional.of(origin));
        when(origin.getGooglePlaceId()).thenReturn("a");
        when(day.getRouteDate()).thenReturn(LocalDate.of(2026, 3, 8));
        var gap = new NavigationRouteRequest("a", "b", TravelMode.WALK, null, 1L, 2L, null, "02:30");
        assertThatThrownBy(() -> service.resolveDeparture(gap)).isInstanceOf(ApiException.class).hasMessageContaining("夏令时");
        when(day.getRouteDate()).thenReturn(LocalDate.of(2026, 11, 1));
        var overlap = new NavigationRouteRequest("a", "b", TravelMode.WALK, null, 1L, 2L, null, "01:30");
        assertThatThrownBy(() -> service.resolveDeparture(overlap)).isInstanceOf(ApiException.class).hasMessageContaining("夏令时");
        var explicit = OffsetDateTime.parse("2026-11-01T01:30:00-05:00");
        assertThat(service.resolveDeparture(new NavigationRouteRequest("a", "b", TravelMode.WALK,
                explicit, 1L, 2L, null, "12:00"))).isEqualTo(explicit);
    }
    @Test void resolvesTimezoneAndDeparturePriority() {
        DailyRoute day=mock(DailyRoute.class);
        TripPlan trip=mock(TripPlan.class);
        RoutePoint origin=mock(RoutePoint.class);
        RoutePoint destination=mock(RoutePoint.class);
        when(days.findById(1L)).thenReturn(Optional.of(day));
        when(day.getId()).thenReturn(1L);
        when(day.getRouteDate()).thenReturn(LocalDate.of(2026,10,1));
        when(day.getTripPlan()).thenReturn(trip);
        when(trip.getTimezone()).thenReturn("Asia/Tokyo");
        when(points.findByIdAndDailyRouteId(2L,1L)).thenReturn(Optional.of(origin));
        when(origin.getId()).thenReturn(2L);
        when(origin.getGooglePlaceId()).thenReturn("a");
        var input = new NavigationRouteRequest("a","b",TravelMode.WALK,null,1L,2L,null,null);
        assertThat(service.resolveDeparture(input)).isEqualTo(OffsetDateTime.parse("2026-10-01T09:00:00+09:00"));
        when(origin.getDepartureTime()).thenReturn("10:30");
        assertThat(service.resolveDeparture(input).toLocalTime()).isEqualTo(LocalTime.of(10,30));
        when(points.findByIdAndDailyRouteId(3L,1L)).thenReturn(Optional.of(destination));
        when(destination.getId()).thenReturn(3L);
        when(destination.getGooglePlaceId()).thenReturn("b");
        when(destination.getSortOrder()).thenReturn(1);
        NavigationSelection saved=mock(NavigationSelection.class);
        when(saved.getDepartureTime()).thenReturn("11:00");
        when(selections.findByDailyRouteIdAndOriginPointIdAndDestinationPointId(1L,2L,3L)).thenReturn(Optional.of(saved));
        assertThat(service.resolveDeparture(new NavigationRouteRequest("a","b",TravelMode.WALK,null,1L,2L,3L,null)).toLocalTime())
                .isEqualTo(LocalTime.of(11,0));
        assertThat(service.resolveDeparture(new NavigationRouteRequest("a","b",TravelMode.WALK,null,1L,2L,3L,"12:00")).toLocalTime())
                .isEqualTo(LocalTime.NOON);
    }
}

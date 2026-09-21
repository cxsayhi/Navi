package com.wanderline.navigation;

import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class E2eGoogleRoutesConfigurationTest {

    @Test
    void returnsADeterministicRouteWithoutAGoogleKey() {
        var gateway = new E2eGoogleRoutesConfiguration().e2eGoogleRoutesGateway();
        var request = new NavigationRouteRequest(
                "origin-place",
                "destination-place",
                TravelMode.WALK,
                OffsetDateTime.parse("2027-01-01T09:00:00+08:00")
        );

        var routes = gateway.computeRoutes(request);

        assertThat(routes).hasSize(1);
        assertThat(routes.getFirst().travelMode()).isEqualTo(TravelMode.WALK);
        assertThat(routes.getFirst().encodedPolyline()).isNotBlank();
    }
}

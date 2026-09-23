package com.wanderline.navigation;

import com.wanderline.WanderlineApplication;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;

import java.time.OffsetDateTime;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class E2eGoogleRoutesConfigurationTest {

    @Test
    void loadsAsAnExplicitE2eApplicationSource() {
        var application = new SpringApplication(WanderlineApplication.class);
        application.setAdditionalProfiles("e2e");
        application.setWebApplicationType(WebApplicationType.NONE);
        application.setSources(Set.of(E2eGoogleRoutesConfiguration.class.getName()));

        try (var context = application.run()) {
            assertThat(context.getBean(GoogleRoutesGateway.class))
                    .isNotInstanceOf(GoogleRoutesClient.class);
        }
    }

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

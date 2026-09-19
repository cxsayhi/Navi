package com.wanderline.navigation;

import com.wanderline.common.error.ApiException;
import com.wanderline.config.ApplicationProperties;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

class GoogleRoutesClientTest {

    @Test
    void mapsAWalkingRouteAndItsSteps() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        GoogleRoutesClient client = new GoogleRoutesClient(builder, properties("server-key"));

        server.expect(requestTo("https://routes.googleapis.com/directions/v2:computeRoutes"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("X-Goog-Api-Key", "server-key"))
                .andExpect(content().json("""
                        {
                          "travelMode": "WALK",
                          "computeAlternativeRoutes": true,
                          "languageCode": "zh-CN",
                          "units": "METRIC"
                        }
                        """, false))
                .andRespond(withSuccess("""
                        {
                          "routes": [{
                            "routeLabels": ["DEFAULT_ROUTE"],
                            "distanceMeters": 1700,
                            "duration": "1260s",
                            "polyline": {"encodedPolyline": "encoded-path"},
                            "localizedValues": {
                              "distance": {"text": "1.7 公里"},
                              "duration": {"text": "21 分钟"}
                            },
                            "legs": [{
                              "steps": [{
                                "distanceMeters": 240,
                                "staticDuration": "180s",
                                "travelMode": "WALK",
                                "navigationInstruction": {"instructions": "向西步行"},
                                "localizedValues": {
                                  "distance": {"text": "240 米"},
                                  "staticDuration": {"text": "3 分钟"}
                                }
                              }]
                            }]
                          }, {
                            "routeLabels": ["DEFAULT_ROUTE_ALTERNATE"],
                            "distanceMeters": 1850,
                            "duration": "1320s",
                            "polyline": {"encodedPolyline": "alternate-path"},
                            "localizedValues": {
                              "distance": {"text": "1.9 公里"},
                              "duration": {"text": "22 分钟"}
                            },
                            "legs": []
                          }]
                        }
                        """, MediaType.APPLICATION_JSON));

        List<NavigationRouteResponse> responses = client.computeRoutes(request(TravelMode.WALK));
        NavigationRouteResponse response = responses.get(0);

        assertThat(responses).hasSize(2);
        assertThat(responses).extracting(NavigationRouteResponse::optionId).doesNotHaveDuplicates();
        assertThat(response.recommended()).isTrue();
        assertThat(responses.get(1).recommended()).isFalse();
        assertThat(response.travelMode()).isEqualTo(TravelMode.WALK);
        assertThat(response.distanceText()).isEqualTo("1.7 公里");
        assertThat(response.durationText()).isEqualTo("21 分钟");
        assertThat(response.encodedPolyline()).isEqualTo("encoded-path");
        assertThat(response.steps()).singleElement().satisfies(step -> {
            assertThat(step.instruction()).isEqualTo("向西步行");
            assertThat(step.durationSeconds()).isEqualTo(180);
        });
        server.verify();
    }

    @Test
    void reportsAMissingServerKeyWithoutCallingGoogle() {
        GoogleRoutesClient client = new GoogleRoutesClient(RestClient.builder(), properties(""));

        assertThatThrownBy(() -> client.computeRoutes(request(TravelMode.TRANSIT)))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("GOOGLE_MAPS_SERVER_API_KEY");
    }

    @Test
    void mapsTransitLineAndStopDetails() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        GoogleRoutesClient client = new GoogleRoutesClient(builder, properties("server-key"));

        server.expect(requestTo("https://routes.googleapis.com/directions/v2:computeRoutes"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("""
                        {"travelMode":"TRANSIT","origin":{"placeId":"place-a"},"destination":{"placeId":"place-b"},"departureTime":"2026-10-01T00:00:00Z"}
                        """, false))
                .andRespond(withSuccess("""
                        {
                          "routes": [{
                            "distanceMeters": 2500,
                            "duration": "900s",
                            "polyline": {"encodedPolyline": "transit-path"},
                            "legs": [{
                              "steps": [{
                                "distanceMeters": 1800,
                                "staticDuration": "540s",
                                "travelMode": "TRANSIT",
                                "transitDetails": {
                                  "headsign": "涩谷",
                                  "stopCount": 3,
                                  "transitLine": {"name": "东京地铁银座线", "nameShort": "G"},
                                  "stopDetails": {
                                    "departureStop": {"name": "浅草"},
                                    "arrivalStop": {"name": "上野"},
                                    "departureTime": "2026-07-20T03:00:00Z",
                                    "arrivalTime": "2026-07-20T03:09:00Z"
                                  }
                                }
                              }]
                            }]
                          }]
                        }
                        """, MediaType.APPLICATION_JSON));

        NavigationRouteResponse response = client.computeRoutes(request(TravelMode.TRANSIT)).get(0);

        assertThat(response.steps()).singleElement().satisfies(step -> {
            assertThat(step.instruction()).isEqualTo("乘坐 G，开往 涩谷");
            assertThat(step.transitLine()).isEqualTo("G");
            assertThat(step.departureStop()).isEqualTo("浅草");
            assertThat(step.arrivalStop()).isEqualTo("上野");
            assertThat(step.stopCount()).isEqualTo(3);
        });
        server.verify();
    }

    @Test
    void requestsTrafficUnawareDrivingWhenDepartureIsOmitted() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        GoogleRoutesClient client = new GoogleRoutesClient(builder, properties("server-key"));

        server.expect(requestTo("https://routes.googleapis.com/directions/v2:computeRoutes"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("""
                        {
                          "origin": {"placeId": "place-a"},
                          "destination": {"placeId": "place-b"},
                          "travelMode": "DRIVE",
                          "computeAlternativeRoutes": true,
                          "languageCode": "zh-CN",
                          "units": "METRIC",
                          "routingPreference": "TRAFFIC_UNAWARE"
                        }
                        """, true))
                .andRespond(withSuccess("""
                        {"routes":[{"distanceMeters":1,"duration":"1s","polyline":{"encodedPolyline":"x"},"legs":[]}]}
                        """, MediaType.APPLICATION_JSON));

        client.computeRoutes(new NavigationRouteRequest("place-a", "place-b", TravelMode.DRIVE, null));

        server.verify();
    }

    @Test
    void classifiesAnEmptyTransitResponseAsRouteUnavailable() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        GoogleRoutesClient client = new GoogleRoutesClient(builder, properties("server-key"));
        server.expect(requestTo("https://routes.googleapis.com/directions/v2:computeRoutes"))
                .andRespond(withSuccess("{\"routes\":[]}", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.computeRoutes(request(TravelMode.TRANSIT)))
                .isInstanceOfSatisfying(ApiException.class, exception -> {
                    assertThat(exception.errorCode()).isEqualTo(com.wanderline.common.error.ErrorCode.MAP_ROUTE_NOT_FOUND);
                    assertThat(exception).hasMessage("当前时间没有可用的公共交通方案");
                });
    }

    @Test
    void classifiesGatewayTimeouts() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        GoogleRoutesClient client = new GoogleRoutesClient(builder, properties("server-key"));
        server.expect(requestTo("https://routes.googleapis.com/directions/v2:computeRoutes"))
                .andRespond(withStatus(HttpStatus.GATEWAY_TIMEOUT));

        assertThatThrownBy(() -> client.computeRoutes(request(TravelMode.WALK)))
                .isInstanceOfSatisfying(ApiException.class, exception ->
                        assertThat(exception.errorCode()).isEqualTo(com.wanderline.common.error.ErrorCode.MAP_TIMEOUT));
    }

    @Test
    void classifiesQuotaExhaustion() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        GoogleRoutesClient client = new GoogleRoutesClient(builder, properties("server-key"));
        server.expect(requestTo("https://routes.googleapis.com/directions/v2:computeRoutes"))
                .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));

        assertThatThrownBy(() -> client.computeRoutes(request(TravelMode.DRIVE)))
                .isInstanceOfSatisfying(ApiException.class, exception -> {
                    assertThat(exception.errorCode()).isEqualTo(com.wanderline.common.error.ErrorCode.MAP_RATE_LIMITED);
                    assertThat(exception).hasMessageContaining("额度");
                });
    }

    private NavigationRouteRequest request(TravelMode mode) {
        return new NavigationRouteRequest(
                "place-a", "place-b", mode, java.time.OffsetDateTime.parse("2026-10-01T09:00:00+09:00")
        );
    }

    private ApplicationProperties properties(String key) {
        return new ApplicationProperties(
                new ApplicationProperties.Cors(List.of("http://localhost:5173")),
                new ApplicationProperties.GoogleMaps(key, Duration.ofSeconds(12))
        );
    }
}

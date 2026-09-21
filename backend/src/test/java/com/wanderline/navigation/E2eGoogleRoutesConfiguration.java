package com.wanderline.navigation;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;

import java.util.List;

@Configuration(proxyBeanMethods = false)
@Profile("e2e")
class E2eGoogleRoutesConfiguration {

    @Bean
    @Primary
    GoogleRoutesGateway e2eGoogleRoutesGateway() {
        return request -> List.of(new NavigationRouteResponse(
                "e2e-" + request.travelMode().name().toLowerCase(),
                true,
                request.travelMode(),
                1000,
                600,
                "1.0 公里",
                "10 分钟",
                "_p~iF~ps|U_ulLnnqC_mqNvxq",
                List.of(new NavigationStepResponse(
                        request.travelMode(),
                        "测试路线",
                        1000,
                        600,
                        "1.0 公里",
                        "10 分钟",
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null
                )),
                List.of()
        ));
    }
}

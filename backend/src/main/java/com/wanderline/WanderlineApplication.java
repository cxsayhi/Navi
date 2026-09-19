package com.wanderline;

import com.wanderline.config.ApplicationProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(ApplicationProperties.class)
public class WanderlineApplication {

    public static void main(String[] args) {
        SpringApplication.run(WanderlineApplication.class, args);
    }
}

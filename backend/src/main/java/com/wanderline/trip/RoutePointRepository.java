package com.wanderline.trip;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RoutePointRepository extends JpaRepository<RoutePoint, Long> {

    Optional<RoutePoint> findByIdAndDailyRouteId(Long id, Long dailyRouteId);
}

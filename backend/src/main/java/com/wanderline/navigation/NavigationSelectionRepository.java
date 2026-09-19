package com.wanderline.navigation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

interface NavigationSelectionRepository extends JpaRepository<NavigationSelection, Long> {

    Optional<NavigationSelection> findByDailyRouteIdAndOriginPointIdAndDestinationPointId(
            Long dailyRouteId,
            Long originPointId,
            Long destinationPointId
    );

    @Query("""
            select selection
            from NavigationSelection selection
            where selection.dailyRoute.tripPlan.id = :tripPlanId
            order by selection.dailyRoute.routeDate asc, selection.originPoint.sortOrder asc
            """)
    List<NavigationSelection> findAllByTripPlanId(@Param("tripPlanId") Long tripPlanId);

    List<NavigationSelection> findAllByDailyRouteId(Long dailyRouteId);

}

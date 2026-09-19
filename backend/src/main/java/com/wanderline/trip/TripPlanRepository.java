package com.wanderline.trip;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TripPlanRepository extends JpaRepository<TripPlan, Long> {

    List<TripPlan> findAllByOrderByUpdatedAtDesc();
}

package com.wanderline.navigation;

import com.wanderline.trip.DailyRoute;
import com.wanderline.trip.RoutePoint;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;

@Entity
@Table(
        name = "navigation_selections",
        uniqueConstraints = @UniqueConstraint(
                name = "navigation_selections_segment_unique",
                columnNames = {"daily_route_id", "origin_point_id", "destination_point_id"}
        )
)
class NavigationSelection {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "daily_route_id", nullable = false)
    private DailyRoute dailyRoute;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "origin_point_id", nullable = false)
    private RoutePoint originPoint;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "destination_point_id", nullable = false)
    private RoutePoint destinationPoint;

    @Enumerated(EnumType.STRING)
    @Column(name = "travel_mode", nullable = false, length = 16)
    private TravelMode travelMode;

    @Column(name = "departure_time", length = 5)
    private String departureTime;
    @Column(nullable = false, length = 20)
    private String status = "PLANNED";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected NavigationSelection() {
    }

    NavigationSelection(DailyRoute dailyRoute, RoutePoint originPoint, RoutePoint destinationPoint) {
        this.dailyRoute = dailyRoute;
        this.originPoint = originPoint;
        this.destinationPoint = destinationPoint;
    }

    void select(TravelMode mode, String departureTime) {
        this.travelMode = mode;
        this.departureTime = departureTime;
    }

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    Long getId() {
        return id;
    }

    Long getDailyRouteId() {
        return dailyRoute.getId();
    }

    Long getOriginPointId() {
        return originPoint.getId();
    }

    Long getDestinationPointId() {
        return destinationPoint.getId();
    }

    TravelMode getTravelMode() {
        return travelMode;
    }

    String getDepartureTime() { return departureTime; }
    String getStatus() { return status; }

    Instant getUpdatedAt() {
        return updatedAt;
    }
}

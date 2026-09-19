package com.wanderline.trip;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "daily_routes")
public class DailyRoute {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "trip_plan_id", nullable = false)
    private TripPlan tripPlan;

    @Column(name = "route_date", nullable = false)
    private LocalDate routeDate;

    @Column(nullable = false, length = 120)
    private String title;

    @Column(length = 2000)
    private String notes;

    @Column(name = "route_color", nullable = false, length = 7)
    private String routeColor;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @OneToMany(mappedBy = "dailyRoute", cascade = jakarta.persistence.CascadeType.ALL)
    @OrderBy("sortOrder ASC")
    private List<RoutePoint> routePoints = new ArrayList<>();

    protected DailyRoute() {
    }

    DailyRoute(TripPlan tripPlan, LocalDate routeDate, String title, String notes, String routeColor) {
        this.tripPlan = tripPlan;
        this.routeDate = routeDate;
        this.title = title;
        this.notes = notes;
        this.routeColor = routeColor;
    }

    void update(LocalDate routeDate, String title, String notes, String routeColor) {
        this.routeDate = routeDate;
        this.title = title;
        this.notes = notes;
        this.routeColor = routeColor;
    }

    void addRoutePoint(RoutePoint routePoint) {
        routePoints.add(routePoint);
    }

    void removeRoutePoint(RoutePoint routePoint) {
        routePoints.remove(routePoint);
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

    public TripPlan getTripPlan() { return tripPlan; }

    public Long getId() {
        return id;
    }

    public LocalDate getRouteDate() {
        return routeDate;
    }

    public String getTitle() {
        return title;
    }

    public String getNotes() {
        return notes;
    }

    public String getRouteColor() {
        return routeColor;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public List<RoutePoint> getRoutePoints() {
        return routePoints;
    }
}

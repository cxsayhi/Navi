package com.wanderline.trip;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "route_points")
public class RoutePoint {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "daily_route_id", nullable = false)
    private DailyRoute dailyRoute;

    @Column(name = "google_place_id", nullable = false, length = 255)
    private String googlePlaceId;

    @Column(name = "custom_name", length = 200)
    private String customName;
    @Column(length = 2000)
    private String note;
    @Column(name = "arrival_time", length = 5)
    private String arrivalTime;
    @Column(name = "departure_time", length = 5)
    private String departureTime;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected RoutePoint() {
    }

    RoutePoint(
            DailyRoute dailyRoute,
            String googlePlaceId,
            String customName, String note, String arrivalTime, String departureTime,
            int sortOrder
    ) {
        this.dailyRoute = dailyRoute;
        this.googlePlaceId = googlePlaceId;
        this.customName = customName;
        this.note = note;
        this.arrivalTime = arrivalTime;
        this.departureTime = departureTime;
        this.sortOrder = sortOrder;
    }

    void moveTo(int sortOrder) {
        this.sortOrder = sortOrder;
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

    public Long getId() {
        return id;
    }

    public String getGooglePlaceId() {
        return googlePlaceId;
    }

    public DailyRoute getDailyRoute() { return dailyRoute; }
    public String getCustomName() { return customName; }
    public String getNote() { return note; }
    public String getArrivalTime() { return arrivalTime; }
    public String getDepartureTime() { return departureTime; }
    void update(String customName, String note, String arrivalTime, String departureTime) {
        this.customName = customName;
        this.note = note;
        this.arrivalTime = arrivalTime;
        this.departureTime = departureTime;
    }
    void moveToDay(DailyRoute day, int position) { this.dailyRoute = day; this.sortOrder = position; }

    public int getSortOrder() {
        return sortOrder;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}

package com.wanderline.navigation;

import com.wanderline.common.error.ApiException;
import com.wanderline.common.error.ErrorCode;
import com.wanderline.trip.DailyRoute;
import com.wanderline.trip.DailyRouteRepository;
import com.wanderline.trip.RoutePoint;
import com.wanderline.trip.RoutePointRepository;
import com.wanderline.trip.TripPlanRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class NavigationSelectionService {


    private final NavigationSelectionRepository selectionRepository;
    private final DailyRouteRepository dailyRouteRepository;
    private final RoutePointRepository routePointRepository;
    private final TripPlanRepository tripPlanRepository;

    public NavigationSelectionService(
            NavigationSelectionRepository selectionRepository,
            DailyRouteRepository dailyRouteRepository,
            RoutePointRepository routePointRepository,
            TripPlanRepository tripPlanRepository
    ) {
        this.selectionRepository = selectionRepository;
        this.dailyRouteRepository = dailyRouteRepository;
        this.routePointRepository = routePointRepository;
        this.tripPlanRepository = tripPlanRepository;
    }

    @Transactional(readOnly = true)
    public NavigationSelectionStateResponse getSelection(
            Long dailyRouteId,
            Long originPointId,
            Long destinationPointId
    ) {
        validateSegment(dailyRouteId, originPointId, destinationPointId);
        NavigationSelectionResponse selection = selectionRepository
                .findByDailyRouteIdAndOriginPointIdAndDestinationPointId(
                        dailyRouteId,
                        originPointId,
                        destinationPointId
                )
                .map(this::toResponse)
                .orElse(null);
        return new NavigationSelectionStateResponse(selection);
    }

    @Transactional(readOnly = true)
    public TripPlanNavigationSelectionsResponse getSelectionsForTripPlan(Long tripPlanId) {
        if (!tripPlanRepository.existsById(tripPlanId)) {
            throw new ApiException(ErrorCode.NOT_FOUND, "旅游计划不存在");
        }
        List<NavigationSelectionResponse> selections = selectionRepository
                .findAllByTripPlanId(tripPlanId)
                .stream()
                .map(this::toResponse)
                .toList();
        return new TripPlanNavigationSelectionsResponse(tripPlanId, selections);
    }

    @Transactional
    public NavigationSelectionResponse saveSelection(SaveNavigationSelectionRequest request) {
        Segment segment = validateSegment(
                request.dailyRouteId(),
                request.originPointId(),
                request.destinationPointId()
        );

        NavigationSelection selection = selectionRepository
                .findByDailyRouteIdAndOriginPointIdAndDestinationPointId(
                        request.dailyRouteId(),
                        request.originPointId(),
                        request.destinationPointId()
                )
                .orElseGet(() -> new NavigationSelection(
                        segment.dailyRoute(),
                        segment.origin(),
                        segment.destination()
                ));
        selection.select(request.travelMode(), request.departureTime());
        return toResponse(selectionRepository.saveAndFlush(selection));
    }

    private Segment validateSegment(Long dailyRouteId, Long originPointId, Long destinationPointId) {
        if (originPointId.equals(destinationPointId)) {
            throw new ApiException(ErrorCode.BAD_REQUEST, "出发 Pin 和到达 Pin 不能相同");
        }
        DailyRoute dailyRoute = dailyRouteRepository.findById(dailyRouteId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "每日路线不存在"));
        RoutePoint origin = routePointRepository.findByIdAndDailyRouteId(originPointId, dailyRouteId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "出发 Pin 不在该每日路线中"));
        RoutePoint destination = routePointRepository.findByIdAndDailyRouteId(destinationPointId, dailyRouteId)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "到达 Pin 不在该每日路线中"));
        if (destination.getSortOrder() != origin.getSortOrder() + 1) {
            throw new ApiException(ErrorCode.CONFLICT, "只能为当前相邻 Pin 保存导航方案");
        }
        return new Segment(dailyRoute, origin, destination);
    }

    private NavigationSelectionResponse toResponse(NavigationSelection selection) {
        return new NavigationSelectionResponse(
                selection.getId(),
                selection.getDailyRouteId(),
                selection.getOriginPointId(),
                selection.getDestinationPointId(),
                selection.getTravelMode(),
                selection.getDepartureTime(),
                selection.getStatus(),
                selection.getUpdatedAt()
        );
    }

    private record Segment(DailyRoute dailyRoute, RoutePoint origin, RoutePoint destination) {
    }
}

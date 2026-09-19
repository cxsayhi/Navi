package com.wanderline.navigation;

import java.util.List;

public record TripPlanNavigationSelectionsResponse(
        Long tripPlanId,
        List<NavigationSelectionResponse> selections
) {
}

package com.wanderline.navigation;

import java.util.List;

interface GoogleRoutesGateway {

    List<NavigationRouteResponse> computeRoutes(NavigationRouteRequest request);
}

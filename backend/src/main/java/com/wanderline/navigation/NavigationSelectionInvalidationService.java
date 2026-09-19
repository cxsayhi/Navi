package com.wanderline.navigation;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NavigationSelectionInvalidationService {

    private final NavigationSelectionRepository repository;

    public NavigationSelectionInvalidationService(NavigationSelectionRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public void retainAdjacent(Long dailyRouteId, java.util.List<Long> orderedIds) {
        repository.findAllByDailyRouteId(dailyRouteId).stream().filter(selection -> {
            int index = orderedIds.indexOf(selection.getOriginPointId());
            return index < 0 || index + 1 >= orderedIds.size()
                    || !orderedIds.get(index + 1).equals(selection.getDestinationPointId());
        }).forEach(repository::delete);
        repository.flush();
    }

    @Transactional
    public int invalidateDailyRoute(Long dailyRouteId) {
        var selections = repository.findAllByDailyRouteId(dailyRouteId);
        repository.deleteAll(selections);
        repository.flush();
        return selections.size();
    }
}

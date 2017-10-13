import { Direction } from '../models/direction';
import { PageService } from '../page-service/page-service';
import { CalculateNextPageStrategy, NextPageCriteria } from './calculate-next-page-strategy';

export class PageModeCalculateNextPageStrategy implements CalculateNextPageStrategy {

  calculateNextPage(criteria: NextPageCriteria): number {
    const isNewPageInCenter = (criteria.currentPageIndex !== criteria.currentPageCenter);
    const speed = criteria.speed;
    const direction = criteria.direction;
    const currentPageCenter = criteria.currentPageCenter;
    let nextPage = criteria.currentPageIndex;

    if (isNewPageInCenter) {
      nextPage = criteria.currentPageCenter;
    } else if (speed >= 200) {
      const diff = direction === Direction.LEFT ? 1 : -1;
      nextPage = criteria.currentPageIndex + diff;
    }

    return nextPage;
  }
}

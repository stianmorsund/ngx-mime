import { PageZoomedModeCalculateNextPageStrategy } from './page-zoomed-mode-calculate-next-page-strategy';

describe('PageZoomedModeCalculateNextPageStrategy ', () => {
  let strategy: PageZoomedModeCalculateNextPageStrategy;

  beforeEach(() => {
    strategy = new PageZoomedModeCalculateNextPageStrategy();
  });


  it('should stay on same page when speed is below 30', () => {
    const res = strategy.calculateNextPage({
      speed: 25,
      direction: 'left',
      currentPageIndex: 1
    });

    expect(res).toBe(1);
  });

  it('should get next page if speed is 30 and direction is left', () => {
    const res = strategy.calculateNextPage({
      speed: 30,
      direction: 'left',
      currentPageIndex: 1
    });

    expect(res).toBe(2);
  });

  it('should get previous page if speed is 30 and direction is right', () => {
    const res = strategy.calculateNextPage({
      speed: 30,
      direction: 'right',
      currentPageIndex: 2
    });

    expect(res).toBe(1);
  });

});
